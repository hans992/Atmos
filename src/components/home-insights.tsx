"use client";
import { useEffect, useRef, useState } from "react";
import { Leaf, RefreshCw } from "lucide-react";
import { useClimate } from "./climate-provider";
import { useWeather } from "./weather-provider";
import { useComfortPreferences } from "./climate-insights";
import { CACHE_TTL_MS, MIN_INTERVAL_MS, choiceText, fallbackChoice, summarizeHome, validateChoice } from "@/lib/home-insights";
import { getSupabase } from "@/lib/supabase";
import type { Sample } from "@/lib/intelligence";
import type { InsightResult } from "@/server/home-insights";

type Stored = { attemptedAt: number; result?: InsightResult };
const memory = new Map<string, Stored>();
const requests = new Map<string, Promise<Stored>>();
function read(key: string): Stored {
  const existing = memory.get(key); if (existing) return existing;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (parsed && Number.isFinite(parsed.attemptedAt) && parsed.attemptedAt <= Date.now()) return parsed;
  } catch {}
  return { attemptedAt: 0 };
}
function write(key: string, value: Stored) {
  memory.set(key, value);
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function HomeInsights() {
  const { rooms, now, session, demo, error, connected } = useClimate();
  const { weather, stale } = useWeather();
  const preferences = useComfortPreferences();
  const outdoor: Sample | null = weather && !stale && weather.current.temperature !== null && weather.current.humidity !== null && Number.isFinite(weather.current.time)
    ? { temperature: weather.current.temperature, humidity: weather.current.humidity, created_at: new Date(weather.current.time).toISOString() } : null;
  const home = summarizeHome(rooms, outdoor, preferences, now);
  const [stored, setStored] = useState<Stored>({ attemptedAt: 0 });
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(0);
  const handledManual = useRef(0);
  const key = session ? `atmos-insights-v1:${session.user.id}` : "";
  const enabled = process.env.NEXT_PUBLIC_CLIMATE_AI_ENABLED === "true" && !!key && !demo && connected && !error;
  const latest = useRef({ home, outdoor, preferences });
  latest.current = { home, outdoor, preferences };

  useEffect(() => {
    if (!enabled || !now || !home.candidates.length) { setBusy(false); return; }
    let alive = true;
    const previous = read(key);
    setStored(previous);
    const result = previous.result;
    const cached = result?.source === "ai" && result.fingerprint === home.fingerprint && result.generatedAt != null && now - result.generatedAt >= 0 && now - result.generatedAt < CACHE_TTL_MS && validateChoice(result.choice, home.candidates);
    // Manual refresh obeys exactly the same minimum interval and daily budgets.
    let task = requests.get(key);
    const manualRefresh = manual !== handledManual.current;
    handledManual.current = manual;
    if (!task && ((cached && !manualRefresh) || now - previous.attemptedAt < MIN_INTERVAL_MS)) { setBusy(false); return; }
    if (!task) {
      const attempt: Stored = { attemptedAt: Date.now() };
      write(key, attempt);
      const { outdoor, preferences } = latest.current;
      task = (async () => {
        try {
          const client = getSupabase();
          if (!client) return attempt;
          const { data, error } = await client.functions.invoke("home-insights", { body: { locale: "en", outdoor, preferences } });
          if (!error && data && typeof data.fingerprint === "string" && ["ai", "rules"].includes(data.source)) attempt.result = data;
        } catch {} // The deterministic insight remains visible on every failure.
        write(key, attempt);
        return attempt;
      })().finally(() => requests.delete(key));
      requests.set(key, task);
    }
    setBusy(true);
    task.then(value => { if (alive) { setStored(value); setBusy(false); } });
    return () => { alive = false; };
    // Only event fingerprint, expiry/cooldown clock, auth state or user refresh
    // matter. Sensor timestamp updates alone never invalidate AI guidance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, home.fingerprint, now, manual]);

  const result = stored.result;
  const aiChoice = enabled && result?.source === "ai" && result.fingerprint === home.fingerprint && result.generatedAt != null && now - result.generatedAt >= 0 && now - result.generatedAt < CACHE_TTL_MS ? validateChoice(result.choice, home.candidates) : null;
  const choice = aiChoice ?? fallbackChoice(home);
  const text = choice && choiceText(choice, home.candidates);
  if (!text) return null;
  return <section className="panel home-insight" aria-label="Home Insights">
    <Leaf size={22} aria-hidden="true" />
    <div><small>Home Insights{aiChoice ? " · AI-assisted" : ""}</small><p>{text}</p></div>
    {enabled && <button type="button" aria-label="Refresh Home Insights" title="Refresh insight (minimum 10 minutes between analyses)" disabled={busy || now - stored.attemptedAt < MIN_INTERVAL_MS} onClick={() => setManual(n => n + 1)}><RefreshCw size={16} aria-hidden="true" /></button>}
  </section>;
}
