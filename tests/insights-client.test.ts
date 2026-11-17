import test from "node:test";
import assert from "node:assert/strict";
import { createInsightsClient, invocationState, refreshLabel, cachedAdvice, readStoredInsight, FAILURE_RETRY_MS, validInsightResult, classifyFailure } from "../src/lib/insights-client";
import { CACHE_TTL_MS, MIN_INTERVAL_MS, summarizeHome } from "../src/lib/home-insights";
import { demoRooms } from "../src/lib/demo";

const now = Date.parse("2026-11-12T12:00:00Z");
const demo = demoRooms(now)[0];
const home = summarizeHome([{...demo, room:"Bedroom", latest:{...demo.latest!,temperature:20,humidity:50},recent:[]}], null, {}, now);
const choice = { insightId: home.candidates[0].id, variant: 0 };
const advice = {schemaVersion:2 as const,insightId:"comfortable",room:"room-1",action:"monitor" as const,text:"Bedroom conditions look comfortable; keep monitoring your usual routine."};
const result = { source: "ai" as const, advice, choice, fingerprint: home.fingerprint, generatedAt: now };
const gate = { featureEnabled: true, signedIn: true, demo: false, connected: true, dataError: false, readingsReady: true, home, stored: { attemptedAt: 0 }, now, inFlight: false };

test("manual refresh explains the cooldown and becomes available at expiry without bypassing it", () => {
 const stored={attemptedAt:now,result};
 const state=invocationState({...gate,stored,manual:true});
 assert.equal(refreshLabel(state,now),"Refresh in 10 min");
 assert.equal(refreshLabel(state,now+MIN_INTERVAL_MS-30_000),"Refresh in <1 min");
 const expired=invocationState({...gate,stored,manual:true,now:now+MIN_INTERVAL_MS});
 assert.equal(expired.reason,"ready");assert.equal(refreshLabel(expired,now+MIN_INTERVAL_MS),"Refresh");
 assert.equal(refreshLabel({reason:"requesting"},now),"Analyzing…");
});

test("AI is displayable only for validated generated advice matching current conditions",()=>{
 assert.equal(cachedAdvice({attemptedAt:now,result},home,now)?.text,advice.text);
 assert.equal(cachedAdvice({attemptedAt:now,result:{...result,advice:undefined}},home,now),null);
 assert.equal(validInsightResult({...result,advice:undefined}),false,"legacy variant-only output cannot display an AI label");
 assert.equal(cachedAdvice({attemptedAt:now,result:{...result,advice:{...advice,text:"Bedroom walls definitely have mold."}}},home,now),null);
 assert.equal(cachedAdvice({attemptedAt:now,result},{...home,fingerprint:"changed"},now),null);
});

test("initial signed-in load invokes when readings are ready; each skip gate is explicit", () => {
  assert.equal(invocationState(gate).reason, "ready");
  for (const [override, reason] of [
    [{ featureEnabled: false }, "disabled"], [{ signedIn: false }, "signed-out"],
    [{ demo: true }, "demo"], [{ connected: false }, "offline"],
    [{ dataError: true }, "data-error"], [{ readingsReady: false }, "waiting-readings"],
    [{ home: summarizeHome([], null, {}, now) }, "no-insight"], [{ inFlight: true }, "requesting"],
  ] as const) assert.equal(invocationState({ ...gate, ...override }).reason, reason);
});
test("cache, meaningful changes, expiry and manual refresh preserve successful-analysis cooldown", () => {
  const stored = { attemptedAt: now, result };
  assert.equal(invocationState({ ...gate, stored }).reason, "cached");
  assert.equal(invocationState({ ...gate, stored, manual: true }).reason, "cooldown");
  assert.equal(invocationState({ ...gate, stored, manual: true, now: now + MIN_INTERVAL_MS }).reason, "ready");
  assert.equal(invocationState({ ...gate, stored, now: now + CACHE_TTL_MS }).reason, "ready");
  const changed = { ...home, fingerprint: "changed" };
  assert.equal(invocationState({ ...gate, stored, home: changed }).reason, "cooldown");
  assert.equal(invocationState({ ...gate, stored, home: changed, now: now + MIN_INTERVAL_MS }).reason, "ready");
});
test("legacy failed requests survive reload with a bounded one-minute retry, not ten-minute silence", () => {
  const stored = readStoredInsight({ attemptedAt: now }, now);
  assert.equal(invocationState({ ...gate, stored }).reason, "retry-wait");
  assert.equal(invocationState({ ...gate, stored, manual: true }).reason, "retry-wait");
  assert.equal(invocationState({ ...gate, stored, now: now + FAILURE_RETRY_MS }).reason, "ready");
  assert.deepEqual(readStoredInsight({ attemptedAt: now + 1000 }, now), { attemptedAt: 0 });
  assert.deepEqual(readStoredInsight({ attemptedAt: "bad" }, now), { attemptedAt: 0 });
});
test("concurrent mounts deduplicate; successful cache survives reload and is scoped to the user", async () => {
  const storage = new Map(); let clock = now; let calls = 0;
  const options = { clock: () => clock, read: (key: string) => storage.get(key), write: (key: string, value: unknown) => { storage.set(key, value); } };
  const client = createInsightsClient(options);
  const invoke = async () => { calls++; return { data: result, error: null }; };
  const a = client.request("user-a", home, invoke), b = client.request("user-a", home, invoke);
  assert.equal(a, b); await Promise.all([a, b]); assert.equal(calls, 1);
  const reloaded = createInsightsClient(options);
  await reloaded.request("user-a", home, invoke); assert.equal(calls, 1);
  await reloaded.request("user-a", home, invoke, true); assert.equal(calls, 1);
  await reloaded.request("user-b", home, invoke); assert.equal(calls, 2);
  clock += MIN_INTERVAL_MS;
  await reloaded.request("user-a", home, invoke, true); assert.equal(calls, 3);
});
test("HTTP, network, malformed and interrupted responses expose failures and retry after backoff", async () => {
  let clock = now; let calls = 0;
  const storage = new Map();
  const options = { clock: () => clock, read: (key: string) => storage.get(key), write: (key: string, value: unknown) => { storage.set(key, value); } };
  const client = createInsightsClient(options);
  const failed = async () => { calls++; return { data: null, error: { name: "FunctionsFetchError" } }; };
  const value = await client.request("user", home, failed);
  assert.equal(value.failure, "network"); assert.equal(calls, 1);
  await client.request("user", home, failed, true); assert.equal(calls, 1);
  clock += FAILURE_RETRY_MS;
  const reloaded = createInsightsClient(options);
  await reloaded.request("user", home, failed); assert.equal(calls, 2);
  clock += FAILURE_RETRY_MS;
  assert.equal((await reloaded.request("user", home, async () => ({ data: { source: "ai" }, error: null }))).failure, "invalid-response");
  clock += FAILURE_RETRY_MS;
  assert.equal((await reloaded.request("user", home, async () => { throw Error("timeout"); })).failure, "network");
  assert.equal(classifyFailure({ context: new Response(null, { status: 401 }) }), "unauthorized");
  assert.equal(classifyFailure({ context: new Response(null, { status: 403 }) }), "forbidden");
  assert.equal(classifyFailure({ context: new Response(null, { status: 503 }) }), "unavailable");
});
test("server rule fallback keeps ten-minute cooldown and malformed cache cannot become AI advice", async () => {
  const client = createInsightsClient({ clock: () => now, read: () => { throw Error("storage disabled"); }, write: () => { throw Error("storage disabled"); } });
  const value = await client.request("user", home, async () => ({ data: { ...result, advice: undefined, source: "rules", generatedAt: null }, error: null }));
  assert.equal(invocationState({ ...gate, stored: value }).reason, "cooldown");
  assert.equal(validInsightResult({ ...result, choice: { insightId: "a", variant: 0, text: "invented" } }), false);
  assert.equal(validInsightResult({ ...result, choice: null }), false);
  assert.equal(validInsightResult({ ...result, generatedAt: "now" }), false);
  assert.equal(client.read("user").result?.source, "rules");
});
