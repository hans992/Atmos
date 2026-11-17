import type { FallbackReason } from "../lib/insight-diagnostics";
export class InsightFailure extends Error {
  constructor(public reason: FallbackReason, public status?: number) { super(reason); }
}
export type DiagnosticEvent = {
  event: "configuration" | "analysis_started" | "cache_reserved" | "gemini_started" | "gemini_completed" | "validation_passed" | "fallback" | "analysis_completed";
  aiEnabled?: boolean;
  apiKeyPresent?: boolean;
  model?: string;
  reason?: FallbackReason;
  source?: "ai" | "rules";
  cacheHit?: boolean;
  status?: number;
  errorCode?: string;
  finishReason?: string;
  outputTokens?: number;
  durationMs?: number;
};
export type DiagnosticLogger = (requestId: string, event: DiagnosticEvent) => void;
// Only explicit, bounded metadata is logged. Never log arbitrary error objects,
// raw model text, prompts, sensor values, room names, JWTs, keys or user IDs.
export const logDiagnostic: DiagnosticLogger = (requestId, event) => {
  const safe = {
    component: "atmos.home-insights", diagnosticVersion: 1, requestId,
    event: event.event, reason: event.reason, source: event.source, cacheHit: event.cacheHit,
    aiEnabled: event.aiEnabled, apiKeyPresent: event.apiKeyPresent,
    model: event.model && /^(models\/)?gemini-[a-z0-9.-]{1,80}$/.test(event.model) ? event.model : undefined,
    status: Number.isInteger(event.status) ? event.status : undefined,
    errorCode: event.errorCode && /^[A-Z0-9]{5,12}$/.test(event.errorCode) ? event.errorCode : undefined,
    finishReason: event.finishReason && /^[A-Z_]{1,40}$/.test(event.finishReason) ? event.finishReason : undefined,
    outputTokens: Number.isInteger(event.outputTokens) ? event.outputTokens : undefined,
    durationMs: Number.isFinite(event.durationMs) ? event.durationMs : undefined,
  };
  console.info(JSON.stringify(safe));
};
export function safeErrorCode(error: unknown): string | undefined {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^[A-Z0-9]{5,12}$/.test(code) ? code : undefined;
}
export function providerFailure(error: unknown): InsightFailure {
  const e = error && typeof error === "object" ? error as { status?: unknown; name?: unknown } : {};
  const status = typeof e.status === "number" && Number.isInteger(e.status) ? e.status : undefined;
  const reason = status === 404 ? "provider_not_found" : status === 429 ? "provider_rate_limited" : status === 401 || status === 403 ? "provider_auth_error" : status === 408 || status === 504 || e.name === "AbortError" || e.name === "TimeoutError" ? "provider_timeout" : "provider_error";
  return new InsightFailure(reason, status);
}
export function parseGeminiResponse(response: { text?: string; candidates?: { finishReason?: string }[]; promptFeedback?: { blockReason?: string }; usageMetadata?: { candidatesTokenCount?: number } }, log: (event: DiagnosticEvent) => void): unknown {
  const finishReason = response.candidates?.[0]?.finishReason;
  log({ event: "gemini_completed", finishReason, outputTokens: response.usageMetadata?.candidatesTokenCount });
  if (response.promptFeedback?.blockReason || ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "RECITATION"].includes(finishReason ?? "")) throw new InsightFailure("provider_blocked");
  if (finishReason === "MAX_TOKENS") throw new InsightFailure("provider_truncated");
  if (finishReason && finishReason !== "STOP") throw new InsightFailure("provider_incomplete");
  const text = response.text;
  if (!text) throw new InsightFailure("response_empty");
  if (text.length > 1024) throw new InsightFailure("response_too_large");
  try { return JSON.parse(text); } catch { throw new InsightFailure("response_invalid_json"); }
}
