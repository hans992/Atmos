import test from "node:test";
import assert from "node:assert/strict";
import { metrics, assess, fresh, validComfort, DEFAULT_COMFORT, type Sample } from "../src/lib/intelligence";
const now=Date.parse("2026-11-12T12:00:00Z");
const sample=(humidity=50, temperature=20, minutes=0):Sample=>({humidity,temperature,created_at:new Date(now-minutes*60000).toISOString()});
const history=(humidity:number, minutes:number)=>Array.from({length:minutes/5+1},(_,i)=>sample(humidity,20,minutes-i*5));
test("Magnus and ideal-gas reference values and boundary humidity",()=>{
 assert.ok(Math.abs(metrics(20,50)!.absoluteHumidity-8.62)<0.03);
 assert.ok(Math.abs(metrics(20,50)!.dewPoint!-9.26)<0.03);
 assert.ok(Math.abs(metrics(25,60)!.dewPoint!-16.69)<0.04);
 assert.ok(Math.abs(metrics(0,100)!.absoluteHumidity-4.85)<0.03);
 assert.equal(metrics(20,100)!.dewPoint,20);
 assert.equal(metrics(20,0)!.dewPoint,null); assert.equal(metrics(20,0)!.absoluteHumidity,0);
 for(const [t,h] of [[NaN,50],[20,Infinity],[null,50],[20,-1],[20,101],["20",50],[61,50]]) assert.equal(metrics(t,h),null);
});
test("single spikes cannot become high risk; sustained exposure can",()=>{
 assert.equal(assess(sample(99),[],null,now).risk,"Moderate Risk");
 assert.equal(assess(sample(80),history(80,120),null,now).risk,"High Risk");
 assert.equal(assess(sample(80),history(80,115),null,now).risk,"Moderate Risk");
});
test("gaps, invalid readings, duplicates and interruptions do not invent exposure",()=>{
 const minuteSeries=Array.from({length:181},(_,i)=>sample(80,20,180-i)).filter(s=>Date.parse(s.created_at)!==now-30*60000);
 assert.equal(assess(sample(80),minuteSeries,null,now).highMinutes,29);
 const h=history(80,180).filter(s=>Date.parse(s.created_at)!==now-30*60000);
 assert.equal(assess(sample(80),h,null,now).highMinutes,25);
 const invalid=history(80,180); invalid[30]={...invalid[30],humidity:NaN};
 assert.equal(assess(sample(80),invalid,null,now).highMinutes,25);
 assert.equal(assess(sample(80),[sample(80),sample(80)],null,now).highMinutes,0);
 const interrupted=history(80,180);interrupted[30]=sample(50,20,30);
 assert.equal(assess(sample(80),interrupted,null,now).risk,"Moderate Risk");
});
test("stale, missing, future and inactive sensors suppress current guidance",()=>{
 for(const s of [null,sample(80,20,10),sample(80,20,-1),{...sample(),created_at:"bad"}]) assert.equal(assess(s,history(80,180),sample(30),now).risk,null);
 assert.equal(assess(sample(),[],null,now,DEFAULT_COMFORT,false).available,false);
 assert.equal(fresh(sample(50,20,9.99),now),true);
});
test("ventilation compares water vapor instead of relative humidity",()=>{
 assert.equal(assess(sample(75),[],sample(95,5),now).advice,"Ventilate Now");
 assert.notEqual(assess(sample(75),[],sample(50,30),now).advice,"Ventilate Now");
 assert.notEqual(assess(sample(75),[],sample(30,5,60),now).advice,"Ventilate Now");
 assert.notEqual(assess(sample(75),[],null,now).advice,"Ventilate Now");
});
test("heating, comfort and customized thresholds",()=>{
 assert.equal(assess(sample(65,16),[],null,now).advice,"Heating Recommended");
 assert.match(assess(sample(65,16),[],null,now).reason,/does not remove/);
 assert.equal(assess(sample(),[],null,now).advice,"Climate Is Optimal");
 assert.equal(assess(sample(65),[],null,now,{...DEFAULT_COMFORT,maxHumidity:65,elevatedHumidity:65}).advice,"Climate Is Optimal");
 assert.equal(validComfort({...DEFAULT_COMFORT,minTemperature:24}),false);
 assert.equal(validComfort({...DEFAULT_COMFORT,highHumidity:60}),false);
});
test("continuous changes, correlation, repeated spells and drying evidence",()=>{
 const rising=history(50,60).map((s,i)=>({...s,humidity:50+i,temperature:20+i/10}));
 const a=assess(rising.at(-1)!,rising,null,now);
 assert.equal(a.humidityChange,12);assert.ok(a.correlation!>.99);assert.equal(a.episodes,1);
 const falling=history(70,60).map((s,i)=>({...s,humidity:70-i}));
 assert.ok(assess(falling.at(-1)!,falling,null,now).moistureChange!<-.5);
 assert.equal(assess(sample(),[sample(60,20,60)],null,now).humidityChange,null);
});
