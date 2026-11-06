import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createHandler, type IngestArguments } from "../supabase/functions/readings/handler";
const device = "00000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000001";
const key = `atm_${"a".repeat(43)}`;
const hash = createHash("sha256").update(key).digest("hex");
const payload = { device_id: device, temperature: 21.4, humidity: 48.2 };
function req(body: unknown = payload, headers: Record<string, string> = {}) {
  return new Request("https://example.test/readings", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body) });
}
test("HTTP validation, bounded body, hashed secrets, and safe errors", async () => {
  const calls: IngestArguments[] = [];
  const handler = createHandler(async (args) => { calls.push(args); return { status: 201, id: "9007199254740993" }; });
  assert.equal((await handler(new Request("https://example.test/readings"))).status, 405);
  assert.equal((await handler(req(payload, { Authorization: "" }))).status, 401);
  assert.equal((await handler(req(payload, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal((await handler(req("{"))).status, 400);
  assert.equal((await handler(req(" ".repeat(1025)))).status, 413);
  for (const bad of [null, [], { ...payload, temperature: "21" }, { ...payload, humidity: -0.01 },
    { ...payload, humidity: 100.01 }, { ...payload, temperature: 85.01 }, { ...payload, temperature: -40.01 },
    { ...payload, device_id: "bad" }, { ...payload, created_at: "fake" }, { ...payload, temperature: null }])
    assert.equal((await handler(req(bad))).status, 422);
  assert.equal((await handler(req(payload, { "X-Reading-Id": "bad" }))).status, 422);
  assert.equal(calls.length, 0);
  const accepted = await handler(req(payload, { "X-Reading-Id": requestId }));
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).id, "9007199254740993");
  assert.deepEqual(calls[0], { p_device_id: device, p_key_hash: hash, p_temperature: 21.4, p_humidity: 48.2, p_request_id: requestId });
  const unavailable = await createHandler(async () => { throw new Error("secret diagnostic"); })(req());
  assert.equal(unavailable.status, 503);
  assert.ok(!(await unavailable.text()).includes("secret"));
  const limited = await createHandler(async () => ({ status: 429, error: "Too many readings", retry_after: 30 }))(req());
  assert.equal(limited.headers.get("Retry-After"), "30");
});
test("SQL authenticates, checks active/ranges, deduplicates, rate limits, and denies viewer access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;`);
    await db.exec(await readFile("supabase/schema.sql", "utf8"));
    await db.exec(await readFile("supabase/ingestion.sql", "utf8"));
    await db.query("insert into public.devices(id,name,room) values ($1,'test','test')", [device]);
    await db.query("insert into private.device_ingest_credentials(device_id,key_hash) values ($1,$2)", [device, hash]);
    const invoke = async (overrides: unknown[] = []) => {
      const values: unknown[] = [device, hash, 21.4, 48.2, requestId];
      overrides.forEach((value, i) => { if (value !== undefined) values[i] = value; });
      return (await db.query<{ result: { status: number; id?: string; duplicate?: boolean } }>(
        "select public.ingest_reading($1,$2,$3,$4,$5) result", values)).rows[0].result;
    };
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(invoke());
      await assert.rejects(db.query("select * from private.device_ingest_credentials"));
      await assert.rejects(db.query("insert into public.sensor_readings(device_id,temperature,humidity) values($1,20,50)", [device]));
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal((await invoke([undefined, "0".repeat(64)])).status, 401);
    assert.equal((await invoke(["00000000-0000-4000-8000-000000000099"])).status, 401);
    for (const t of [86, "NaN", null]) assert.equal((await invoke([undefined, undefined, t])).status, 422);
    assert.equal((await invoke([undefined, undefined, undefined, 101])).status, 422);
    const inserted = await invoke();
    assert.equal(inserted.status, 201);
    const retried = await invoke();
    assert.equal(retried.status, 200);
    assert.equal(retried.id, inserted.id);
    assert.equal(retried.duplicate, true);
    assert.equal((await invoke([undefined, undefined, 22])).status, 409);
    const next = [undefined, undefined, undefined, undefined, "10000000-0000-4000-8000-000000000002"];
    assert.equal((await invoke(next)).status, 429);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.sensor_readings")).rows[0].count, 1);
    await db.exec("reset role; update public.devices set active=false; set role service_role");
    assert.equal((await invoke()).status, 403);
    await db.exec("reset role; update public.devices set active=true; update private.device_ingest_credentials set revoked_at=now(); set role service_role");
    assert.equal((await invoke()).status, 401);
    await db.exec("reset role; update private.device_ingest_credentials set revoked_at=null, last_received_at=now()-interval '31 seconds'; set role service_role");
    assert.equal((await invoke(next)).status, 201);
  } finally { await db.close(); }
});
