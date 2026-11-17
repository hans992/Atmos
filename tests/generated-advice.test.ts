import test from "node:test";
import assert from "node:assert/strict";
import { summarizeHome } from "../src/lib/home-insights";
import { adviceOptions, adviceValidationError, validateAdvice, type GeneratedAdvice } from "../src/lib/generated-advice";
import { createInsightService, type InsightCache } from "../src/server/home-insights";
import { demoRooms } from "../src/lib/demo";
import { metrics } from "../src/lib/intelligence";

const now=Date.parse("2026-11-17T06:30:00Z");
const sample=(temperature:number,humidity:number,age=0)=>({temperature,humidity,created_at:new Date(now-age).toISOString()});
const room=(t=15.2,h=72)=>({...demoRooms(now)[0],room:"Bedroom",latest:{...demoRooms(now)[0].latest!,...sample(t,h)},recent:[]});
const outdoor=sample(4.6,92);
const home=summarizeHome([room()],outdoor,{},now);
const advice:GeneratedAdvice={schemaVersion:2,insightId:"humidity",room:"room-1",action:"ventilate_then_heat",text:"Your cool Bedroom has humid air; drier outdoor air may help with brief ventilation, followed by gentle heating for comfort."};

test("high outdoor RH can still mean lower absolute humidity; cold indoor rooms support ventilation then heating",()=>{
 const r=home.summary.rooms[0];
 assert.ok(outdoor.humidity>r.reading!.humidity);
 assert.ok(metrics(outdoor.temperature,outdoor.humidity)!.absoluteHumidity<r.absoluteHumidity!);
 assert.ok(r.absoluteHumidityDifference!>1);
 assert.ok(r.outdoorAbsoluteHumidityAtIndoorTemperature!<r.absoluteHumidity!);
 assert.equal(r.ventilationSuitable,true);assert.equal(r.cold,true);
 assert.equal(adviceOptions(home)[0].action,"ventilate_then_heat");
 assert.deepEqual(validateAdvice(advice,home),advice);
});
test("lower outdoor RH alone cannot authorize ventilation when outdoor water content is higher",()=>{
 const h=summarizeHome([room()],sample(25,50),{},now);
 assert.equal(h.summary.rooms[0].ventilationSuitable,false);
 assert.ok(h.summary.rooms[0].absoluteHumidityDifference!<0);
 assert.equal(adviceOptions(h)[0].action,"heat");
 assert.equal(adviceValidationError(advice,h),"response_action_mismatch");
});
test("stale, future, missing and invalid weather cannot authorize ventilation or outdoor claims",()=>{
 for(const outside of [null,sample(4.6,92,60*60_000),sample(4.6,92,-1000),sample(4.6,101)]) {
  const h=summarizeHome([room()],outside,{},now);
  assert.equal(h.summary.outdoor.fresh,false);assert.equal(h.summary.rooms[0].absoluteHumidityDifference,null);
  assert.equal(adviceValidationError(advice,h),"response_action_mismatch");
  assert.equal(validateAdvice({...advice,action:"heat",text:"Bedroom is cool and humid; gentle heating may improve comfort, while heating does not remove moisture. Check moisture sources."},h)?.action,"heat");
  assert.equal(adviceValidationError({...advice,action:"heat",text:"Bedroom heating may improve comfort; heating does not remove moisture. Check moisture sources and drier outdoor air."},h),"response_ungrounded_advice");
 }
});
test("priority, persistent exposure and actual low temperature constrain generated actions",()=>{
 const r=room();r.recent=Array.from({length:25},(_,i)=>sample(15.2,72,i*5*60_000)) as typeof r.recent;
 const h=summarizeHome([r],outdoor,{},now);
 assert.equal(h.candidates[0].id,"sustained");
 assert.equal(adviceValidationError(advice,h),"response_unknown_insight");
 const persistent={...advice,insightId:"sustained",text:"Persistent Bedroom humidity needs attention; check moisture sources. Drier outdoor air may help with brief ventilation, then gentle heating for comfort."};
 assert.ok(validateAdvice(persistent,h));
 assert.equal(adviceValidationError({...persistent,text:advice.text},h),"response_action_mismatch");
 const warm=summarizeHome([room(21,72)],outdoor,{},now);
 assert.equal(adviceOptions(warm)[0].action,"ventilate");
 assert.equal(adviceValidationError(advice,warm),"response_action_mismatch");
 const crossing=summarizeHome([room(18.9,72)],outdoor,{},now);
 const crossed=summarizeHome([room(19.1,72)],outdoor,{},now);
 assert.notEqual(crossing.fingerprint,crossed.fingerprint,"crossing comfort threshold invalidates even within a temperature bucket");
});
test("strict schema, concise original prose and action consistency reject unsafe or unsupported output",()=>{
 for(const bad of [null,[],{insightId:"humidity",variant:0},{...advice,extra:true},{...advice,schemaVersion:1},{...advice,action:"buy_heater"}]) assert.equal(adviceValidationError(bad,home),"response_invalid_advice_schema");
 for(const text of [
  "Bedroom walls have mold; ventilation will fix it.",
  "Bedroom ventilation may help for five minutes, then heating removes moisture.",
  "Bedroom humidity is safe; open windows to guarantee dry air.",
  "Bedroom is 15.2°C; open windows and then heat.",
  "Bedroom has a leak; drier outdoor air may help with ventilation then heating.",
  "Bedroom humidity is rising; drier outdoor air may help with ventilation then heating.",
  "Bedroom is cool; avoid ventilation, then heating may help with drier outdoor air.",
  "Bedroom is cool; drier outdoor air may help with ventilation, then heating may remove moisture.",
  "Bedroom is cool. Drier outdoor air may help. Ventilate then heat.",
  "Bedroom "+"humid ".repeat(40)+"air.",
  "Bedroom <script>alert('x')</script>.",
  "Bedroom. https://example.com/",
 ]) assert.notEqual(adviceValidationError({...advice,text},home),null,text);
 assert.equal(adviceValidationError({...advice,room:"room-9"},home),"response_action_mismatch");
});
test("accepted generated prose is persisted and reused; rejected prose and legacy cache never earn AI status",async()=>{
 let saved:unknown=null;let calls=0;
 const cache:InsightCache={reserve:async()=>({lease:"lease"}),complete:async(_u,_l,v)=>{saved=v;}};
 const run=createInsightService(cache,async()=>{calls++;return advice;},()=>now);
 const result=await run("viewer",home,true);
 assert.equal(result.source,"ai");assert.equal(result.advice?.text,advice.text);assert.equal(result.fallbackReason,null);
 const reused=createInsightService({...cache,reserve:async()=>({cached:{choice:saved,generatedAt:now}})},async()=>{throw Error("cache must avoid provider");},()=>now);
 assert.equal((await reused("viewer",home,true)).advice?.text,advice.text);assert.equal(calls,1);
 for(const bad of [{...advice,text:"Bedroom mold is confirmed."},{...advice,action:"heat"}]) {
  const result=await createInsightService(cache,async()=>bad,()=>now)("viewer",home,true);
  assert.equal(result.source,"rules");assert.equal(result.advice,undefined);assert.ok(result.fallbackReason);assert.equal(saved,null);
 }
 const legacy=createInsightService({...cache,reserve:async()=>({cached:{choice:{insightId:"humidity",variant:0},generatedAt:now}})},async()=>advice,()=>now);
 assert.equal((await legacy("viewer",home,true)).fallbackReason,"cache_invalid");
 const limited=createInsightService({...cache,reserve:async()=>({reason:"cooldown"})},async()=>{throw Error("must not bypass cooldown");},()=>now);
 assert.equal((await limited("viewer",home,true)).fallbackReason,"cooldown");
});
