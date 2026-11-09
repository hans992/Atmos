"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  cachedWeather,
  fetchWeather,
  isWeatherStale,
  locationKey,
  usableWeather,
  WEATHER_REFRESH_MS,
  type WeatherSnapshot,
} from "@/lib/weather";
import { useAppearance } from "./appearance-provider";
type WeatherContext = {
  weather: WeatherSnapshot | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  now: number;
  refresh: () => void;
};
const Context = createContext<WeatherContext | null>(null);
export function WeatherProvider({ children }: { children: ReactNode }) {
  const { preferences, ready } = useAppearance();
  const location = preferences.location;
  const key = location ? locationKey(location) : "";
  const [state, setState] = useState<{
    key: string;
    weather: WeatherSnapshot | null;
    loading: boolean;
    error: string | null;
  }>({ key: "", weather: null, loading: false, error: null });
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 60_000);
    const visible = () => {
      if (!document.hidden) {
        setNow(Date.now());
        refresh();
      }
    };
    const online = () => refresh();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", online);
    };
  }, [refresh]);
  useEffect(() => {
    if (!ready || !location) return;
    let disposed = false;
    let working = false;
    const load = async () => {
      if (document.hidden || working) return;
      const cached = cachedWeather(location);
      setState((previous) => ({
        key,
        weather: cached ?? (previous.key === key ? previous.weather : null),
        loading: navigator.onLine,
        error: navigator.onLine
          ? null
          : "You’re offline. Weather will update when you reconnect.",
      }));
      if (!navigator.onLine) return;
      working = true;
      try {
        const weather = await fetchWeather(location);
        if (!disposed) {
          setNow(Date.now());
          setState({ key, weather, loading: false, error: null });
        }
      } catch {
        if (!disposed)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: "Weather couldn’t refresh. Try again shortly.",
          }));
      } finally {
        working = false;
      }
    };
    void load();
    const poll = setInterval(() => void load(), WEATHER_REFRESH_MS);
    return () => {
      disposed = true;
      clearInterval(poll);
    };
    // A location's display name does not change its weather request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, revision]);
  const weather =
    state.key === key &&
    state.weather &&
    usableWeather(state.weather, now || Date.now())
      ? state.weather
      : null;
  return (
    <Context.Provider
      value={{
        weather,
        loading:
          Boolean(location) && (!ready || state.key !== key || state.loading),
        error: state.key === key ? state.error : null,
        stale: Boolean(weather && isWeatherStale(weather, now)),
        now,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWeather() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing WeatherProvider");
  return value;
}
