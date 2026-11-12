import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomCard } from "../src/components/room-card";
import { AppearanceProvider } from "../src/components/appearance-provider";
import { WeatherProvider } from "../src/components/weather-provider";
import { ClimateInsights, ComfortProvider } from "../src/components/climate-insights";
import { demoRooms } from "../src/lib/demo";

test("room cards show one compact recommendation without technical panels or forms",()=>{
 const now=Date.parse("2026-11-12T12:00:00Z");
 const room=demoRooms(now)[0];
 const card=h(RoomCard,{room,now});
 const html=renderToStaticMarkup(h(AppearanceProvider,{children:h(WeatherProvider,{children:h(ComfortProvider,{children:card})})}));
 assert.match(html,/room-recommendation/);
 assert.doesNotMatch(html,/Absolute humidity|Dew point|<details|<form|Save room preferences|class="status /);
 assert.doesNotMatch(html,/NaN|Infinity/);
});

test("room details keep metrics and methodology behind closed disclosure controls",()=>{
 const now=Date.parse("2026-11-12T12:00:00Z");
 const room=demoRooms(now)[0];
 const html=renderToStaticMarkup(h(AppearanceProvider,{children:h(WeatherProvider,{children:h(ComfortProvider,{children:h(ClimateInsights,{room,now})})})}));
 assert.match(html,/<details class="panel climate-insights"><summary>Climate details<\/summary>/);
 assert.match(html,/Absolute humidity/); assert.match(html,/Dew point/);
 assert.match(html,/<summary>How this guidance works<\/summary>/);
 assert.match(html,/not a diagnosis/); assert.match(html,/Wall temperatures are not measured/);
 assert.match(html,/Save room preferences/); assert.doesNotMatch(html,/<details[^>]*open/);
});
