import { CACHE_TTL_MS, MIN_INTERVAL_MS, validateChoice, type HomeSummary } from "./home-insights";
import type { InsightResult } from "../server/home-insights";

// Transport failures did not produce an analysis. Retry them conservatively,
// without bypassing the authoritative server's ten-minute/daily AI budgets.
export const FAILURE_RETRY_MS = 60_000;
export type Failure = "network" | "unauthorized" | "forbidden" | "unavailable" | "invalid-response";
export type StoredInsight = { attemptedAt: number; result?: InsightResult; failure?: Failure };
export type InvocationReason = "disabled" | "signed-out" | "demo" | "offline" | "data-error" | "waiting-readings" | "no-insight" | "requesting" | "cached" | "cooldown" | "retry-wait" | "ready";
export type InvocationState = { reason: InvocationReason; nextAttemptAt?: number };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function validInsightResult(v: unknown): v is InsightResult {
  if (!object(v) || (v.source !== "ai" && v.source !== "rules") || typeof v.fingerprint !== "string" || v.fingerprint.length > 65536) return false;
  if (v.choice !== null && (!object(v.choice) || Object.keys(v.choice).sort().join() !== "insightId,variant" || typeof v.choice.insightId !== "string" || !Number.isInteger(v.choice.variant) || (v.choice.variant as number) < 0)) return false;
  return v.source === "ai" ? v.choice !== null && typeof v.generatedAt === "number" && Number.isFinite(v.generatedAt) : v.generatedAt === null;
}
export function readStoredInsight(v: unknown, now: number): StoredInsight {
  if (!object(v) || typeof v.attemptedAt !== "number" || !Number.isFinite(v.attemptedAt) || v.attemptedAt < 0 || v.attemptedAt > now) return { attemptedAt: 0 };
  const result = validInsightResult(v.result) ? v.result : undefined;
  const failure = ["network", "unauthorized", "forbidden", "unavailable", "invalid-response"].includes(String(v.failure)) ? v.failure as Failure : undefined;
  // Legacy v1 entries with no result were failed/interrupted calls, not AI analyses.
  return { attemptedAt: v.attemptedAt, result, failure };
}
export function cachedChoice(stored: StoredInsight, home: HomeSummary, now: number) {
  const r = stored.result;
  return r?.source === "ai" && r.fingerprint === home.fingerprint && r.generatedAt !== null && now >= r.generatedAt && now - r.generatedAt < CACHE_TTL_MS ? validateChoice(r.choice, home.candidates) : null;
}
export function invocationState(input: {
  featureEnabled: boolean; signedIn: boolean; demo: boolean; connected: boolean;
  dataError: boolean; readingsReady: boolean; home: HomeSummary; stored: StoredInsight;
  now: number; inFlight: boolean; manual?: boolean;
}): InvocationState {
  const { stored, now } = input;
  if (!input.featureEnabled) return { reason: "disabled" };
  if (!input.signedIn) return { reason: "signed-out" };
  if (input.demo) return { reason: "demo" };
  if (!input.connected) return { reason: "offline" };
  if (input.dataError) return { reason: "data-error" };
  if (!input.readingsReady || !now) return { reason: "waiting-readings" };
  if (!input.home.candidates.length) return { reason: "no-insight" };
  if (input.inFlight) return { reason: "requesting" };
  if (!input.manual && cachedChoice(stored, input.home, now)) return { reason: "cached", nextAttemptAt: stored.result!.generatedAt! + CACHE_TTL_MS };
  const failed = !stored.result || !!stored.failure;
  const nextAttemptAt = stored.attemptedAt + (failed ? FAILURE_RETRY_MS : MIN_INTERVAL_MS);
  if (stored.attemptedAt > 0 && now < nextAttemptAt) return { reason: failed ? "retry-wait" : "cooldown", nextAttemptAt };
  return { reason: "ready" };
}
export const INVOCATION_LABELS: Record<InvocationReason, string> = {
  disabled: "AI is disabled in this frontend build.",
  "signed-out": "Sign in to request AI advice.",
  demo: "Demo mode uses local guidance only.",
  offline: "You are offline. Local guidance remains available.",
  "data-error": "Waiting for sensor data to load successfully.",
  "waiting-readings": "Waiting for the initial sensor readings.",
  "no-insight": "No indoor observation is available to analyze.",
  requesting: "Requesting a home analysis…",
  cached: "Using a matching cached AI insight (up to one hour).",
  cooldown: "The last request completed. Automatic analysis waits at least ten minutes between requests.",
  "retry-wait": "The last request did not complete successfully. Retrying after a one-minute pause.",
  ready: "Ready to request an analysis.",
};
export const FAILURE_LABELS: Record<Failure, string> = {
  network: "Could not reach the AI endpoint. Check the connection and the function’s allowed origin.",
  unauthorized: "The AI endpoint rejected the session. Sign out and sign in again.",
  forbidden: "The AI endpoint denied access. Check the viewer permission and allowed origin.",
  unavailable: "The AI endpoint is unavailable. Rule-based guidance is still active.",
  "invalid-response": "The AI endpoint returned an unexpected response. Rule-based guidance is still active.",
};
export function classifyFailure(error: unknown): Failure {
  const status = object(error) && object(error.context) ? error.context.status : undefined;
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  return object(error) && error.name === "FunctionsFetchError" ? "network" : "unavailable";
}

export function createInsightsClient(options: {
  read: (key: string) => unknown;
  write: (key: string, value: StoredInsight) => void;
  clock?: () => number;
}) {
  const clock = options.clock ?? Date.now;
  const memory = new Map<string, StoredInsight>();
  const pending = new Map<string, Promise<StoredInsight>>();
  function read(key: string) {
    let value: unknown = memory.get(key);
    if (!value) { try { value = options.read(key); } catch {} }
    return readStoredInsight(value, clock());
  }
  function write(key: string, value: StoredInsight) {
    memory.set(key, value);
    try { options.write(key, value); } catch {} // Private mode may block storage.
  }
  function request(key: string, home: HomeSummary, invoke: () => Promise<{ data: unknown; error: unknown }>, manual = false): Promise<StoredInsight> {
    const active = pending.get(key); if (active) return active;
    const before = read(key);
    const decision = invocationState({ featureEnabled: true, signedIn: !!key, demo: false, connected: true, dataError: false, readingsReady: true, home, stored: before, now: clock(), inFlight: false, manual });
    if (decision.reason !== "ready") return Promise.resolve(before);
    const attempt: StoredInsight = { attemptedAt: clock() };
    write(key, attempt);
    // Defer invoke until the pending map is populated, including synchronous failures.
    const task = Promise.resolve().then(async () => {
      try {
        const { data, error } = await invoke();
        if (error) attempt.failure = classifyFailure(error);
        else if (validInsightResult(data)) attempt.result = data;
        else attempt.failure = "invalid-response";
      } catch { attempt.failure = "network"; }
      write(key, attempt);
      return attempt;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  return { read, request, inFlight: (key: string) => pending.has(key) };
}
