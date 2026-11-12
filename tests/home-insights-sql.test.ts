import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("durable AI cache enforces roles, deduplication, expiry, cooldown, leases and daily budgets in Postgres",async()=>{
 const db=new PGlite();
 const user="00000000-0000-4000-8000-000000000001";
 const fingerprint="a".repeat(64), changed="b".repeat(64);
 try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile("supabase/home-insights.sql","utf8"));
  // The optional setup is safe to reapply.
  await db.exec(await readFile("supabase/home-insights.sql","utf8"));
  const reserve=async(hash=fingerprint)=>{
   const r=await db.query<{slot:{lease?:string;cached?:{choice:unknown;generatedAt:number}}}>("select public.reserve_home_insight($1,$2) as slot",[user,hash]);return r.rows[0].slot;
  };
  const complete=async(lease:string,choice:unknown)=>db.query("select public.complete_home_insight($1,$2,$3::jsonb)",[user,lease,choice === null ? null : JSON.stringify(choice)]);
  for(const role of ["anon","authenticated"]) {
   await db.exec(`set role ${role}`);
   await assert.rejects(reserve());
   await assert.rejects(db.query("select * from atmos_private.home_insight_cache"));
   await db.exec("reset role");
  }
  await db.exec("set role service_role");
  const first=await reserve();assert.ok(first.lease);
  assert.deepEqual(await reserve(),{});
  await complete("00000000-0000-4000-8000-000000000099",{insightId:"comfortable",variant:0});
  assert.deepEqual(await reserve(),{},"wrong lease cannot publish a result");
  const choice={insightId:"comfortable",variant:0};
  await complete(first.lease!,choice);
  assert.deepEqual((await reserve()).cached?.choice,choice);
  assert.deepEqual(await reserve(changed),{},"meaningful events cannot bypass cooldown");
  await db.exec("update atmos_private.home_insight_cache set last_attempt=now()-interval '11 minutes'");
  const next=await reserve(changed);assert.ok(next.lease);
  await complete(first.lease!,choice);
  assert.deepEqual(await reserve(changed),{},"old lease cannot overwrite newer work");
  await complete(next.lease!,choice);
  await db.exec("update atmos_private.home_insight_cache set generated_at=now()-interval '61 minutes',last_attempt=now()-interval '11 minutes'");
  const expired=await reserve(changed);assert.ok(expired.lease,"expired cache triggers a new claim");
  await complete(expired.lease!,null);
  await db.exec("update atmos_private.home_insight_cache set last_attempt=now()-interval '11 minutes',attempts=24");
  assert.deepEqual(await reserve(),{},"per-user daily cap");
  await db.exec("update atmos_private.home_insight_cache set attempts=0; update atmos_private.home_insight_budget set attempts=100");
  assert.deepEqual(await reserve(),{},"project-wide daily cap");
  await db.exec("update atmos_private.home_insight_budget set budget_day=(now() at time zone 'UTC')::date-1; update atmos_private.home_insight_cache set budget_day=(now() at time zone 'UTC')::date-1,attempts=24");
  assert.ok((await reserve()).lease,"UTC budget rollover");
  await assert.rejects(reserve("bad"));
 } finally { await db.close(); }
});
