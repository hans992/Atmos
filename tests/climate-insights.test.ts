import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomCard } from "../src/components/room-card";
import { AppearanceProvider } from "../src/components/appearance-provider";
import { WeatherProvider } from "../src/components/weather-provider";
import { ComfortProvider } from "../src/components/climate-insights";
import { demoRooms } from "../src/lib/demo";

test("room cards keep navigation separate from expandable insights and forms",()=>{
 const now=Date.parse("2026-11-12T12:00:00Z");
 const room=demoRooms(now)[0];
 const card=h(RoomCard,{room,now});
 const html=renderToStaticMarkup(h(AppearanceProvider,{children:h(WeatherProvider,{children:h(ComfortProvider,{children:card})})}));
 assert.match(html,/Absolute humidity/); assert.match(html,/Dew point/);
 assert.match(html,/Climate Insights/); assert.match(html,/not a diagnosis/);
 assert.match(html,/Save room preferences/);
 assert.ok(html.indexOf("</a>")<html.indexOf("<details>"),"Interactive details must not be nested inside a navigation link");
 assert.doesNotMatch(html,/NaN|Infinity/);
});
