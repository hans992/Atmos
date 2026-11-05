import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("schema, seed, constraints, RLS, and history aggregation execute in Postgres", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to authenticated;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      grant execute on function auth.jwt() to authenticated;`);
    await db.exec(await readFile("supabase/schema.sql", "utf8"));
    await db.exec(await readFile("supabase/seed.sql", "utf8"));
    const devices = await db.query<{ count: number }>(
      "select count(*)::int as count from public.devices",
    );
    assert.equal(devices.rows[0].count, 6);
    const readings = await db.query<{ count: number }>(
      "select count(*)::int as count from public.sensor_readings",
    );
    assert.ok(readings.rows[0].count > 4000);
    await assert.rejects(
      db.exec(
        "insert into public.sensor_readings(device_id,temperature,humidity) values ('00000000-0000-4000-8000-000000000001',22,101)",
      ),
    );
    await assert.rejects(
      db.exec(
        "insert into public.sensor_readings(device_id,temperature,humidity) values ('00000000-0000-4000-8000-000000000099',22,50)",
      ),
    );
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from public.devices"));
    await assert.rejects(
      db.query("select * from public.climate_history(null,'30d')"),
    );
    await db.exec("reset role; set role authenticated");
    assert.equal(
      (await db.query("select * from public.devices")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.climate_history(null,'30d')")).rows
        .length,
      0,
    );
    await db.exec(
      `set request.jwt.claims = '{"app_metadata":{"climate_viewer":true}}'`,
    );
    assert.equal(
      (await db.query("select * from public.devices")).rows.length,
      6,
    );
    for (const window of ["24h", "7d", "30d"]) {
      const result = await db.query<{ reading_count: number }>(
        `select * from public.climate_history(null,'${window}')`,
      );
      assert.ok(result.rows.length > 0 && result.rows.length <= 193);
    }
    const all = await db.query<{ reading_count: number }>(
      "select * from public.climate_history(null,'30d')",
    );
    assert.ok(
      all.rows.reduce((sum, r) => sum + Number(r.reading_count), 0) > 4000,
    );
    const single = await db.query<{ reading_count: number }>(
      "select * from public.climate_history('00000000-0000-4000-8000-000000000001','30d')",
    );
    assert.ok(
      single.rows.reduce((sum, r) => sum + Number(r.reading_count), 0) > 700,
    );
    await assert.rejects(
      db.query("select * from public.climate_history(null,'1y')"),
    );
    await assert.rejects(
      db.exec("insert into public.devices(name,room) values('x','x')"),
    );
    await db.exec(
      `set request.jwt.claims = '{"user_metadata":{"climate_viewer":true}}'`,
    );
    assert.equal(
      (await db.query("select * from public.devices")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
