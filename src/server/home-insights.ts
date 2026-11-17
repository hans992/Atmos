// Server-only module: imported exclusively by the Edge Function and unit tests.
import { CACHE_TTL_MS, fallbackChoice, type Choice, type HomeSummary } from "../lib/home-insights";
import { adviceValidationError, validateAdvice, type GeneratedAdvice } from "../lib/generated-advice";
import { isFallbackReason, type FallbackReason } from "../lib/insight-diagnostics";
import { InsightFailure, safeErrorCode, type DiagnosticLogger } from "./insight-diagnostics";

export type InsightResult = { choice: Choice | null; advice?: GeneratedAdvice; source: "rules" | "ai"; generatedAt: number | null; fingerprint: string; fallbackReason?: FallbackReason | null; requestId?: string };
// Retain the existing JSONB cache envelope and RPC. Variant is legacy storage
// metadata only; generated advice is validated independently and rendered as text.
export type CachedAdvice = Choice & { advice: GeneratedAdvice };
export interface InsightCache {
  reserve(userId: string, fingerprint: string): Promise<{ cached?: { choice: unknown; generatedAt: number }; lease?: string; reason?: string }>;
  complete(userId: string, lease: string, choice: CachedAdvice | null): Promise<void>;
}
export function createInsightService(cache: InsightCache, generate: (home: HomeSummary, requestId: string) => Promise<unknown>, clock = Date.now, logger: DiagnosticLogger = () => {}) {
  const pending = new Map<string, Promise<InsightResult>>();
  return function analyze(userId: string, home: HomeSummary, enabled: boolean, context?: { requestId: string; disabledReason?: FallbackReason }): Promise<InsightResult> {
    const requestId = context?.requestId ?? crypto.randomUUID();
    const start = clock();
    const log: DiagnosticLogger = (id, event) => { try { logger(id, event); } catch {} };
    const fallback: InsightResult = { choice: fallbackChoice(home), source: "rules", generatedAt: null, fingerprint: home.fingerprint, requestId };
    function finish(reason: FallbackReason | null, advice?: GeneratedAdvice, generatedAt?: number, cacheHit = false, error?: unknown): InsightResult {
      if (reason) log(requestId, { event: "fallback", reason, errorCode: safeErrorCode(error), status: error instanceof InsightFailure ? error.status : undefined });
      const result: InsightResult = reason ? { ...fallback, fallbackReason: reason } : { ...fallback, source: "ai", advice: advice!, generatedAt: generatedAt!, fallbackReason: null };
      log(requestId, { event: "analysis_completed", source: result.source, reason: reason ?? undefined, cacheHit, durationMs: clock() - start });
      return result;
    }
    log(requestId, { event: "analysis_started" });
    if (!enabled) return Promise.resolve(finish(context?.disabledReason ?? "ai_disabled"));
    if (!home.candidates.length) return Promise.resolve(finish("no_insight"));
    const key = `${userId}:${home.fingerprint}`;
    const running = pending.get(key);
    if (running) return running;
    const task = (async () => {
      let slot: Awaited<ReturnType<InsightCache["reserve"]>>;
      try { slot = await cache.reserve(userId, home.fingerprint); }
      catch (error) { return finish("cache_read_failed", undefined, undefined, false, error); }
      if (slot.cached) {
        const cached = slot.cached.choice as Partial<CachedAdvice> | null;
        const advice = validateAdvice(cached?.advice, home);
        if (advice && cached?.insightId === advice.insightId && cached.variant === 0 && clock() >= slot.cached.generatedAt && clock() - slot.cached.generatedAt < CACHE_TTL_MS)
          return finish(null, advice, slot.cached.generatedAt, true);
        return finish("cache_invalid");
      }
      const lease = slot.lease;
      if (!lease) return finish(isFallbackReason(slot.reason) ? slot.reason : "cache_not_reserved");
      log(requestId, { event: "cache_reserved" });
      async function release() { try { await cache.complete(userId, lease!, null); } catch {} }
      let value: unknown;
      try { value = await generate(home, requestId); }
      catch (error) {
        await release();
        return finish(error instanceof InsightFailure ? error.reason : "provider_error", undefined, undefined, false, error);
      }
      const invalid = adviceValidationError(value, home);
      if (invalid) { await release(); return finish(invalid); }
      const advice = validateAdvice(value, home)!;
      log(requestId, { event: "validation_passed" });
      try { await cache.complete(userId, lease, { insightId: advice.insightId, variant: 0, advice }); }
      catch (error) {
        await release();
        return finish(error instanceof InsightFailure ? error.reason : "cache_write_failed", undefined, undefined, false, error);
      }
      return finish(null, advice, clock());
    })().finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}
