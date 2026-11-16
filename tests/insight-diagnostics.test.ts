import test from "node:test";
import assert from "node:assert/strict";
import { choiceValidationError, summarizeHome } from "../src/lib/home-insights";
import { createInsightService, type InsightCache } from "../src/server/home-insights";
import { InsightFailure, logDiagnostic, parseGeminiResponse, providerFailure, type DiagnosticEvent } from "../src/server/insight-diagnostics";
import { demoRooms } from "../src/lib/demo";

const now=Date.parse("2026-11-16T12:00:00Z");
const home=summarizeHome(demoRooms(now),null,{},now);
const choice={insightId:home.candidates[0].id,variant:0};
const context={requestId:"00000000-0000-4000-8000-000000000001"};
test("Gemini parser accepts valid structured output and distinguishes truncation, blocking and invalid JSON",()=>{
 const events:DiagnosticEvent[]=[];
 assert.deepEqual(parseGeminiResponse({text:JSON.stringify(choice),candidates:[{finishReason:"STOP"}]},e=>events.push(e)),choice);
 for(const [response,reason] of [
  [{text:JSON.stringify(choice),candidates:[{finishReason:"MAX_TOKENS"}]},"provider_truncated"],
  [{promptFeedback:{blockReason:"SAFETY"}},"provider_blocked"],
  [{text:"```json\n{}\n```"},"response_invalid_json"],
  [{text:""},"response_empty"], [{text:"a".repeat(1025)},"response_too_large"],
 ] as const) assert.throws(()=>parseGeminiResponse(response,()=>{}),e=>e instanceof InsightFailure && e.reason===reason);
 assert.equal(events[0].event,"gemini_completed");
});
test("strict insight and per-candidate variant validation gives precise rejection reasons without coercion",()=>{
 const candidates=[{id:"first",priority:1,variants:["A"]},{id:"second",priority:1,variants:["B","C"]}];
 assert.equal(choiceValidationError({insightId:"second",variant:1},candidates),null);
 assert.equal(choiceValidationError({insightId:"first",variant:1},candidates),"response_variant_out_of_range");
 assert.equal(choiceValidationError({insightId:"first",variant:"0"},candidates),"response_invalid_variant");
 assert.equal(choiceValidationError({insightId:"unknown",variant:0},candidates),"response_unknown_insight");
 assert.equal(choiceValidationError({insightId:"first",variant:0,text:"unsafe"},candidates),"response_unexpected_fields");
});
test("full analysis lifecycle distinguishes every fallback stage and acknowledges a valid persisted choice",async()=>{
 const events:DiagnosticEvent[]=[];let saved:unknown;
 const cache:InsightCache={reserve:async()=>({lease:"lease"}),complete:async(_u,_l,c)=>{saved=c;}};
 const analyze=createInsightService(cache,async()=>choice,()=>now,(_id,e)=>events.push(e));
 const ai=await analyze("user",home,true,context);
 assert.equal(ai.source,"ai");assert.equal(ai.fallbackReason,null);assert.deepEqual(saved,choice);
 assert.deepEqual(events.map(e=>e.event),["analysis_started","cache_reserved","validation_passed","analysis_completed"]);
 assert.equal((await analyze("user",home,false,context)).fallbackReason,"ai_disabled");
 assert.equal((await analyze("user",home,false,{...context,disabledReason:"api_key_missing"})).fallbackReason,"api_key_missing");
 for(const reason of ["cooldown","analysis_in_progress","user_daily_budget","project_daily_budget"]) {
  const a=createInsightService({...cache,reserve:async()=>({reason})},async()=>{throw Error("must not call Gemini");});
  assert.equal((await a("user",home,true,context)).fallbackReason,reason);
 }
 const brokenRead=createInsightService({...cache,reserve:async()=>{throw {code:"42501",message:"secret"};}},async()=>choice);
 assert.equal((await brokenRead("user",home,true,context)).fallbackReason,"cache_read_failed");
 const brokenWrite=createInsightService({...cache,complete:async()=>{throw Error("write failed");}},async()=>choice);
 assert.equal((await brokenWrite("user",home,true,context)).fallbackReason,"cache_write_failed");
 const invalid=createInsightService(cache,async()=>({...choice,variant:99}));
 assert.equal((await invalid("user",home,true,context)).fallbackReason,"response_variant_out_of_range");
 const quota=createInsightService(cache,async()=>{throw providerFailure({status:429,message:"secret"});});
 assert.equal((await quota("user",home,true,context)).fallbackReason,"provider_rate_limited");
});
test("diagnostics exclude response content, credentials and arbitrary provider error messages",()=>{
 const original=console.info;const lines:string[]=[];console.info=(line:string)=>{lines.push(line);};
 try {
  logDiagnostic(context.requestId,{event:"fallback",reason:"provider_error",errorCode:"secret-api-key",finishReason:"secret prompt",status:500});
 } finally {console.info=original;}
 assert.doesNotMatch(lines.join(),/secret|prompt|api-key/);
 assert.match(lines[0],/provider_error/);
 assert.equal(providerFailure({status:403,message:"secret"}).message,"provider_auth_error");
});
