"use client";
import { memo, useEffect, useState, type CSSProperties } from "react";
import { dayPhase } from "@/lib/weather";
import { useAppearance } from "./appearance-provider";
import { useWeather } from "./weather-provider";

// Deterministic positions keep SSR/hydration stable. Only transforms animate.
const drops = Array.from(
  { length: 42 },
  (_, i) =>
    ({
      left: `${(i * 37 + 3) % 100}%`,
      top: `${(i * 23 + 7) % 100}%`,
      "--drop-size": `${3 + (i % 5)}px`,
      "--duration": `${14 + (i % 13)}s`,
      "--delay": `${-i * 2.7}s`,
    }) as CSSProperties,
);
const flakes = Array.from(
  { length: 24 },
  (_, i) =>
    ({
      left: `${(i * 43 + 1) % 100}%`,
      "--drop-size": `${2 + (i % 3)}px`,
      "--duration": `${22 + (i % 17)}s`,
      "--delay": `${-i * 4}s`,
    }) as CSSProperties,
);
const WindowEffects = memo(function WindowEffects() {
  return (
    <>
      <div className="window-rain">
        {drops.map((style, i) => (
          <i
            key={i}
            className={i % 4 === 0 ? "glass-drop sliding" : "glass-drop"}
            style={style}
          />
        ))}
      </div>
      <div className="outside-snow">
        {flakes.map((style, i) => (
          <i key={i} style={style} />
        ))}
      </div>
    </>
  );
});
export const WeatherAtmosphere = memo(function WeatherAtmosphere() {
  const { preferences, ready } = useAppearance();
  const { weather, stale, now } = useWeather();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const update = () => setPaused(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  if (!ready || !preferences.dynamic) return null;
  const live = preferences.synchronization === "live" && weather && !stale;
  return (
    <div
      className="weather-atmosphere"
      aria-hidden="true"
      data-weather={live ? weather.current.condition : "unknown"}
      data-phase={live ? dayPhase(weather, now) : "neutral"}
      data-style={preferences.background}
      data-intensity={preferences.intensity}
      data-paused={paused}
    >
      <div className="garden-scene" />
      <div className="environment-light" />
      <div className="night-veil" />
      <div className="garden-lights" />
      <div className="cloud-shadow" />
      <div className="atmosphere-haze" />
      <WindowEffects />
      <div className="window-frost" />
    </div>
  );
});
