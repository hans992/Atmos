"use client";
import { useEffect, useRef, useState } from "react";
import { Info, Leaf, RefreshCw } from "lucide-react";
import { useClimate } from "./climate-provider";
import { useWeather } from "./weather-provider";
import { useComfortPreferences } from "./climate-insights";
import { choiceText, fallbackChoice, summarizeHome } from "@/lib/home-insights";
import { cachedChoice, createInsightsClient, FAILURE_LABELS, INVOCATION_LABELS, invocationState, type StoredInsight } from "@/lib/insights-client";
import { getSupabase } from "@/lib/supabase";
import type { Sample } from "@/lib/intelligence";

// Direct access is required for Next.js to inline the production build flag.
const FEATURE_ENABLED = process.env.NEXT_PUBLIC_CLIMATE_AI_ENABLED === "true";
const clientCache = createInsightsClient({
  read: key => JSON.parse(sessionStorage.getItem(key) ?? "null"),
  write: (key, value) => sessionStorage.setItem(key, JSON.stringify(value)),
});

export function HomeInsights() {
  const { rooms, now, session, demo, error, connected, refreshed } = useClimate();
  const { weather, stale } = useWeather();
  const preferences = useComfortPreferences();
  const outdoor: Sample | null = weather && !stale && weather.current.temperature !== null && weather.current.humidity !== null && Number.isFinite(weather.current.time)
    ? { temperature: weather.current.temperature, humidity: weather.current.humidity, created_at: new Date(weather.current.time).toISOString() } : null;
  const home = summarizeHome(rooms, outdoor, preferences, now);
  const [snapshot, setSnapshot] = useState<{ key: string; value: StoredInsight }>({ key: "", value: { attemptedAt: 0 } });
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(0);
  const handledManual = useRef(0);
  const key = session ? `atmos-insights-v1:${session.user.id}` : "";
  const stored = snapshot.key === key ? snapshot.value : { attemptedAt: 0 };
  const gate = { featureEnabled: FEATURE_ENABLED, signedIn: !!session, demo, connected, dataError: !!error, readingsReady: refreshed > 0, home, stored, now, inFlight: busy };
  const state = invocationState(gate);
  const manualState = invocationState({ ...gate, manual: true });
  const latest = useRef({ home, outdoor, preferences, gate });
  latest.current = { home, outdoor, preferences, gate };

  useEffect(() => {
    let alive = true;
    const { home, outdoor, preferences, gate } = latest.current;
    const previous = clientCache.read(key);
    setSnapshot({ key, value: previous });
    const manualRefresh = manual !== handledManual.current;
    handledManual.current = manual;
    const decision = invocationState({ ...gate, stored: previous, inFlight: clientCache.inFlight(key), manual: manualRefresh });
    if (decision.reason !== "ready" && decision.reason !== "requesting") { setBusy(false); return; }
    setBusy(true);
    const task = clientCache.request(key, home, async () => {
      const client = getSupabase();
      if (!client) throw new Error("Supabase client unavailable");
      return client.functions.invoke("home-insights", {
        body: { locale: "en", outdoor, preferences },
        timeout: 20_000,
      });
    }, manualRefresh);
    setSnapshot({ key, value: clientCache.read(key) });
    task.then(value => {
      if (alive) {
        setSnapshot({ key, value });
        setBusy(false);
        if (value.failure) console.warn(`[Atmos AI] ${FAILURE_LABELS[value.failure]}`);
      }
    });
    return () => { alive = false; };
    // The 15-second provider clock checks expiry/backoff. Reading timestamps do
    // not invalidate matching analyses. Pending calls are shared across mounts.
  }, [key, home.fingerprint, now, manual, demo, connected, error, refreshed]);

  const usable = FEATURE_ENABLED && !!session && !demo && connected && !error;
  const aiChoice = usable ? cachedChoice(stored, home, now) : null;
  const choice = aiChoice ?? fallbackChoice(home);
  const text = choice && choiceText(choice, home.candidates);
  if (!text) return null;
  return <section className="panel home-insight" aria-label="Home Insights">
    <Leaf size={22} aria-hidden="true" />
    <div><small>Home Insights{aiChoice ? " · AI-assisted" : ""}</small><p>{text}</p>
      <details className="insight-status">
        <summary><Info size={12} aria-hidden="true" /> AI status</summary>
        <p>{INVOCATION_LABELS[state.reason]}</p>
        {stored.failure && <p>{FAILURE_LABELS[stored.failure]}</p>}
        {stored.result?.source === "rules" && <p>The server returned rule-based guidance. AI may be disabled, limited, or temporarily unavailable.</p>}
        <dl><dt>Frontend AI flag</dt><dd>{FEATURE_ENABLED ? "Enabled" : "Disabled"}</dd>
          <dt>Session</dt><dd>{session ? "Signed in" : "Signed out"}</dd>
          <dt>Last request</dt><dd>{stored.attemptedAt ? new Date(stored.attemptedAt).toLocaleString() : "Not requested in this session"}</dd>
          {state.nextAttemptAt && <><dt>{state.reason === "cached" ? "Cache expires" : "Next automatic attempt"}</dt><dd>{new Date(state.nextAttemptAt).toLocaleTimeString()}</dd></>}
        </dl>
      </details>
    </div>
    {FEATURE_ENABLED && !!session && !demo && <button type="button" aria-label="Refresh Home Insights" title={manualState.reason === "ready" ? "Request home analysis" : INVOCATION_LABELS[manualState.reason]} disabled={manualState.reason !== "ready"} onClick={() => setManual(n => n + 1)}><RefreshCw size={16} aria-hidden="true" /></button>}
  </section>;
}
