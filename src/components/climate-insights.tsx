"use client";
import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from "react";
import { assess, DEFAULT_COMFORT, validComfort, type Comfort } from "@/lib/intelligence";
import { display } from "@/lib/climate";
import type { Room } from "@/lib/types";
import { isOutdoor } from "@/lib/room-presentation";
import { useWeather } from "./weather-provider";
const KEY="atmos-comfort-v1";
const Context=createContext<{values:Record<string,Comfort>; save:(id:string,p:Comfort)=>boolean}>({values:{},save:()=>false});
export function ComfortProvider({children}:{children:ReactNode}) {
 const [values,setValues]=useState<Record<string,Comfort>>({});
 useEffect(()=>{try {const parsed:unknown=JSON.parse(localStorage.getItem(KEY)||"{}"); if(parsed && typeof parsed==="object") setValues(Object.fromEntries(Object.entries(parsed).filter(([,p])=>p && typeof p==="object" && Object.keys(DEFAULT_COMFORT).every(k=>typeof p[k]==="number") && validComfort(p))));}catch{}},[]);
 const save=(id:string,p:Comfort)=>{const next={...values,[id]:p};setValues(next);try{localStorage.setItem(KEY,JSON.stringify(next));return true;}catch{return false;}};
 return <Context.Provider value={{values,save}}>{children}</Context.Provider>;
}
export function useComfortPreferences() { return useContext(Context).values; }
export function useRoomComfort(id:string) {return useContext(Context).values[id] ?? DEFAULT_COMFORT;}
function Preferences({id,p}:{id:string;p:Comfort}) {
 const {save}=useContext(Context); const [message,setMessage]=useState("");
 const labels:Record<keyof Comfort,string>={minTemperature:"Minimum temperature (°C)",maxTemperature:"Maximum temperature (°C)",minHumidity:"Minimum RH (%)",maxHumidity:"Maximum RH (%)",elevatedHumidity:"Elevated RH above (%)",highHumidity:"High RH above (%)"};
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const data=new FormData(e.currentTarget);const next=Object.fromEntries(Object.keys(DEFAULT_COMFORT).map(k=>[k,Number(data.get(k))])) as Comfort;if(!validComfort(next)){setMessage("Use 5–35°C, ordered temperature limits, and 0 ≤ minimum RH < maximum RH ≤ elevated RH < high RH ≤ 100.");return;}setMessage(save(id,next)?"Saved on this browser.":"Applied for this session; browser storage is unavailable.");}
 return <details><summary>Room comfort preferences</summary><form onSubmit={submit} className="climate-preferences">{(Object.keys(labels) as (keyof Comfort)[]).map(k=><label key={k}>{labels[k]}<input name={k} type="number" step="1" required defaultValue={p[k]} /></label>)}<button className="button" type="submit">Save room preferences</button><p role="status">{message}</p></form><p>Guidance thresholds, not universal mold boundaries. Saved on this browser.</p></details>;
}
export function useRoomAssessment(room:Room,now:number) {
 const {weather,stale}=useWeather(); const p=useRoomComfort(room.id);
 const time=weather?.current.time;
 const outside=weather && !stale && time !== undefined && Number.isFinite(time) ? {temperature:weather.current.temperature as number,humidity:weather.current.humidity as number,created_at:new Date(time).toISOString()} : null;
 const a=assess(room.latest,room.recent??[],outside,now,p,room.active);
 return a;
}
export function RoomRecommendation({room,now}:{room:Room;now:number}) {
 const a=useRoomAssessment(room,now);
 return <span className="room-recommendation">{isOutdoor(room.room) ? "Outdoor conditions" : a.available ? a.advice : "Awaiting fresh readings"}</span>;
}
export function ClimateInsights({room,now}:{room:Room;now:number}) {
 const a=useRoomAssessment(room,now); const p=useRoomComfort(room.id);
 if(isOutdoor(room.room)) return null;
 return <details className="panel climate-insights"><summary>Climate details</summary><section aria-label={`${room.room} climate intelligence`}>
 <p><strong>{a.advice}</strong></p>
 <p className="climate-secondary">Absolute humidity {display(a.current?.absoluteHumidity)} g/m³ · Dew point {display(a.current?.dewPoint)}°C{!a.available && " · Last known / unavailable"}</p>
 <p>{a.risk ? `Estimated mold risk: ${a.risk}` : "Insufficient current data"}</p>
 <details><summary>How this guidance works</summary>
 <p>{a.reason}</p><p>Estimated mold risk from air readings only. Surface temperature, insulation and exposure affect actual mold growth; this is not a diagnosis.</p>
 <dl><dt>Relative humidity</dt><dd>How close the air is to saturation at its current temperature.</dd><dt>Absolute humidity</dt><dd>Grams of water vapor per cubic metre of air.</dd><dt>Dew point</dt><dd>Condensation may form on surfaces at or below {display(a.current?.dewPoint)}°C. Wall temperatures are not measured.</dd></dl>
 {a.available && <><p>Observed current spell above {p.elevatedHumidity}%: approximately {Math.floor(a.elevatedMinutes)} minutes. {a.samples} samples in the last six hours (up to 400 readings). Gaps beyond the observed cadence (at most seven minutes) break continuity. Limited history does not establish long-term safety.</p><p>Recent continuous trend: temperature {display(a.temperatureChange)}°C; RH {display(a.humidityChange)} percentage points. Temperature/RH correlation: {display(a.correlation,2)} (association, not causation).</p><p>{a.episodes} observed transitions into elevated humidity in this window.</p>{a.moistureChange !== null && a.moistureChange < -0.5 && <p>Air moisture has decreased. This is consistent with drying or ventilation, but Atmos cannot identify the cause.</p>}</>}
 <p>{a.outdoor ? `Outdoor absolute humidity: ${display(a.outdoor.absoluteHumidity)} g/m³. Ventilation compares vapor content at the same indoor temperature.` : "Outdoor moisture comparison unavailable or stale."}</p>
 <Preferences key={JSON.stringify(p)} id={room.id} p={p}/>
 </details></section></details>;
}
