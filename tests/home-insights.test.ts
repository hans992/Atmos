import test from "node:test";
import assert from "node:assert/strict";
import { summarizeHome, validateChoice, choiceText, fallbackChoice, CACHE_TTL_MS } from "../src/lib/home-insights";
import { createInsightService, type InsightCache } from "../src/server/home-insights";
import { createInsightsHandler, parseInput } from "../src/server/insights-handler";
import { demoRooms } from "../src/lib/demo";
import { DEFAULT_COMFORT } from "../src/lib/intelligence";

const now = Date.parse("2026-11-12T12:00:00Z");
function room(humidity=50, temperature=20) {
 const r=demoRooms(now)[0];
 return {...r,room:"Bedroom",latest:{...r.latest!,humidity,temperature,created_at:new Date(now).toISOString()},recent:[]};
}
const home = () => summarizeHome([room()],null,{},now);
test("strict model schema rejects extra text, unknown IDs, wrong types and out-of-range variants",()=>{
 const h=home();
 assert.deepEqual(validateChoice({insightId:"comfortable",variant:0},h.candidates),{insightId:"comfortable",variant:0});
 for(const v of [null,[],"text",{insightId:"comfortable",variant:"0"},{insightId:"comfortable",variant:0,text:"Mold confirmed"},{insightId:"ventilate",variant:0},{insightId:"comfortable",variant:-1},{insightId:"comfortable",variant:2},{insightId:"comfortable",variant:.5}]) assert.equal(validateChoice(v,h.candidates),null);
});
test("critical deterministic observations cannot be downgraded or replaced by ventilation claims",()=>{
 const r=room(80); r.recent=Array.from({length:25},(_,i)=>({...r.latest,created_at:new Date(now-i*5*60000).toISOString()}));
 const h=summarizeHome([r,room()],null,{},now);
 assert.equal(h.candidates[0].id,"sustained");
 assert.equal(validateChoice({insightId:"comfortable",variant:0},h.candidates),null);
 const humidity=summarizeHome([room(65)],null,{},now);
 assert.doesNotMatch(choiceText(fallbackChoice(humidity)!,humidity.candidates)!,/ventilat/i);
 const outside={temperature:5,humidity:50,created_at:new Date(now).toISOString()};
 const ventilate=summarizeHome([room(65)],outside,{},now);
 assert.match(choiceText(fallbackChoice(ventilate)!,ventilate.candidates)!,/may help/);
 assert.doesNotMatch(JSON.stringify(ventilate.candidates),/guarantee|minutes|measured wall/);
});
test("insights remain short, omit empty homes, avoid whole-home comfort claims with missing rooms",()=>{
 assert.equal(fallbackChoice(summarizeHome([],null,{},now)),null);
 for(const r of [room(),room(80),room(30),room(50,16),room(50,27)]) {
   const h=summarizeHome([r],null,{},now);
   for(const c of h.candidates) for(const text of c.variants) assert.ok(text.split(/\s+/).length<30);
 }
 const stale={...room(),active:false};
 const h=summarizeHome([room(),stale],null,{},now);
 assert.equal(h.candidates[0].id,"coverage");
});
test("meaningful events invalidate cache while timestamp churn does not; payload omits identities and history",()=>{
 const r=room();const h=summarizeHome([r],null,{},now);
 const newer={...r,latest:{...r.latest,created_at:new Date(now+60000).toISOString()}};
 assert.equal(summarizeHome([newer],null,{},now+60000).fingerprint,h.fingerprint);
 assert.notEqual(summarizeHome([room(65)],null,{},now).fingerprint,h.fingerprint);
 assert.notEqual(summarizeHome([r],null,{},now+600000).fingerprint,h.fingerprint);
 const privateRoom={...r,room:"Alice Smith 14 Private Street",name:"alice@example.com"};
 const serialized=JSON.stringify(summarizeHome([privateRoom],null,{},now).summary);
 assert.doesNotMatch(serialized,/Alice|Private Street|alice@|device_id|recent|"id"/);
 assert.match(serialized,/absoluteHumidity|dewPoint|timestamp|trend|elevatedMinutes/);
});
test("cache reuse, disabled feature, invalid output, exceptions and storage failures all preserve safe behavior",async()=>{
 const h=home();let calls=0;let completions=0;
 const generate=async()=>{calls++;return {insightId:"comfortable",variant:1};};
 const cache:InsightCache={reserve:async()=>({cached:{choice:{insightId:"comfortable",variant:0},generatedAt:now}}),complete:async()=>{completions++;}};
 assert.equal((await createInsightService(cache,generate,()=>now)("a",h,true)).source,"ai"); assert.equal(calls,0);
 assert.equal((await createInsightService(cache,generate,()=>now)("a",h,false)).source,"rules");assert.equal(calls,0);
 const blocked={...cache,reserve:async()=>({})};
 assert.equal((await createInsightService(blocked,generate,()=>now)("a",h,true)).source,"rules"); assert.equal(calls,0);
 const broken={...cache,reserve:async()=>{throw Error("db down");}};
 assert.equal((await createInsightService(broken,generate,()=>now)("a",h,true)).source,"rules"); assert.equal(calls,0);
 const claimed={...cache,reserve:async()=>({lease:"token"})};
 for(const gen of [async()=>({insightId:"comfortable",variant:99}),async()=>{throw Error("quota");}]) {
  const result=await createInsightService(claimed,gen,()=>now)("a",h,true);
  assert.equal(result.source,"rules");assert.deepEqual(result.choice,fallbackChoice(h));
 }
 assert.equal(completions,2);
 const expired={...cache,reserve:async()=>({cached:{choice:{insightId:"comfortable",variant:0},generatedAt:now-CACHE_TTL_MS}})};
 assert.equal((await createInsightService(expired,generate,()=>now)("a",h,true)).source,"rules");
});
test("simultaneous analysis requests share one generation and persist one result",async()=>{
 let calls=0;let completes=0;
 const analyze=createInsightService({reserve:async()=>({lease:"token"}),complete:async()=>{completes++;}},async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {insightId:"comfortable",variant:1};},()=>now);
 const results=await Promise.all(Array.from({length:10},()=>analyze("same-user",home(),true)));
 assert.equal(calls,1);assert.equal(completes,1);assert.ok(results.every(r=>r.source==="ai"));
});
test("request validation bounds preferences, locale and weather; endpoint rejects unauthorized requests",async()=>{
 const input={locale:"en",outdoor:null,preferences:{}};
 assert.ok(parseInput(input));assert.equal(parseInput({...input,locale:"de"}),null);
 assert.equal(parseInput({...input,apiKey:"secret"}),null);
 assert.equal(parseInput({...input,outdoor:{temperature:20,humidity:101,created_at:new Date(now).toISOString()}}),null);
 assert.equal(parseInput({...input,preferences:{bad:DEFAULT_COMFORT}}),null);
 const handle=createInsightsHandler({url:"https://example.supabase.co",anonKey:"test",serviceKey:"test",model:"gemini-2.5-flash-lite",enabled:false,allowedOrigin:"https://atmos.test"});
 assert.equal((await handle(new Request("https://api.test",{method:"POST"}))).status,401);
 assert.equal((await handle(new Request("https://api.test",{method:"POST",headers:{origin:"https://bad.test"}}))).status,403);
 const preflight=await handle(new Request("https://api.test",{method:"OPTIONS",headers:{origin:"https://atmos.test"}}));
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get("access-control-allow-origin"),"https://atmos.test");
});

test("endpoint requires trusted viewer metadata, bounds request bodies and reads sensors under caller RLS",async()=>{
 const originalFetch=globalThis.fetch;
 let viewer=false;const reads:string[]=[];
 const r=room(); r.latest.created_at=new Date().toISOString();
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init);
  const url=new URL(request.url);
  if(url.pathname==="/auth/v1/user") return Response.json({id:r.id,app_metadata:viewer?{climate_viewer:true}:{},user_metadata:{climate_viewer:true}});
  assert.equal(request.headers.get("authorization"),"Bearer viewer-token");
  reads.push(url.pathname);
  if(url.pathname.endsWith("/devices")) return Response.json([{id:r.id,name:r.name,room:r.room,active:r.active,created_at:r.created_at}]);
  if(url.pathname.endsWith("/sensor_readings")) return Response.json([r.latest]);
  throw Error("Unexpected external call");
 };
 try {
  const handle=createInsightsHandler({url:"https://example.supabase.co",anonKey:"public-key",serviceKey:"private-key",model:"gemini-2.5-flash-lite",enabled:false,allowedOrigin:"https://atmos.test"});
  const request=(body:unknown)=>new Request("https://api.test",{method:"POST",headers:{authorization:"Bearer viewer-token","content-type":"application/json"},body:JSON.stringify(body)});
  const input={locale:"en",outdoor:null,preferences:{}};
  assert.equal((await handle(request(input))).status,403,"user-editable metadata cannot grant access");
  assert.equal(reads.length,0);
  viewer=true;
  assert.equal((await handle(request({...input,padding:"a".repeat(17000)}))).status,400);
  assert.equal(reads.length,0);
  const response=await handle(request(input));
  assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.source,"rules");assert.equal(body.choice.insightId,"comfortable");
  assert.deepEqual(reads,["/rest/v1/devices","/rest/v1/sensor_readings"]);
 } finally {globalThis.fetch=originalFetch;}
});
