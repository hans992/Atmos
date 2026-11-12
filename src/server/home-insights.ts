// Server-only module: imported exclusively by the Edge Function and unit tests.
import { CACHE_TTL_MS, fallbackChoice, validateChoice, type Choice, type HomeSummary } from "../lib/home-insights";

export type InsightResult = { choice: Choice | null; source: "rules" | "ai"; generatedAt: number | null; fingerprint: string };
export interface InsightCache {
  reserve(userId: string, fingerprint: string): Promise<{ cached?: { choice: unknown; generatedAt: number }; lease?: string }>;
  complete(userId: string, lease: string, choice: Choice | null): Promise<void>;
}
export function createInsightService(cache: InsightCache, generate: (home: HomeSummary) => Promise<unknown>, clock = Date.now) {
  const pending = new Map<string, Promise<InsightResult>>();
  return function analyze(userId: string, home: HomeSummary, enabled: boolean): Promise<InsightResult> {
    const fallback: InsightResult = { choice: fallbackChoice(home), source: "rules", generatedAt: null, fingerprint: home.fingerprint };
    if (!enabled || !home.candidates.length) return Promise.resolve(fallback);
    const key = `${userId}:${home.fingerprint}`;
    const running = pending.get(key);
    if (running) return running;
    const task = (async () => {
      let lease: string | undefined;
      try {
        const slot = await cache.reserve(userId, home.fingerprint);
        const cached = slot.cached && validateChoice(slot.cached.choice, home.candidates);
        if (cached && slot.cached && clock() - slot.cached.generatedAt >= 0 && clock() - slot.cached.generatedAt < CACHE_TTL_MS)
          return { ...fallback, choice: cached, source: "ai" as const, generatedAt: slot.cached.generatedAt };
        lease = slot.lease;
        if (!lease) return fallback;
        const choice = validateChoice(await generate(home), home.candidates);
        await cache.complete(userId, lease, choice);
        lease = undefined;
        return choice ? { ...fallback, choice, source: "ai" as const, generatedAt: clock() } : fallback;
      } catch {
        // Fail closed if durable cache/budget storage is unavailable. No logs
        // contain sensor payloads, model output, JWTs, keys or private labels.
        if (lease) { try { await cache.complete(userId, lease, null); } catch {} }
        return fallback;
      }
    })().finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}
