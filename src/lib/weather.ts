/** Weather has its own model: forecast values never enter the sensor data flow. */
export type WeatherCondition =
  | "sunny"
  | "partly-cloudy"
  | "overcast"
  | "rain"
  | "heavy-rain"
  | "snow"
  | "mixed"
  | "fog"
  | "thunderstorm"
  | "unknown";
export type DayPhase =
  | "dawn"
  | "morning"
  | "afternoon"
  | "golden-hour"
  | "dusk"
  | "night"
  | "neutral";
export type WeatherLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
};
export type WeatherHour = {
  time: number;
  temperature: number | null;
  code: number | null;
  isDay: boolean | null;
};
export type WeatherDay = {
  time: number;
  low: number | null;
  high: number | null;
  code: number | null;
  sunrise: number | null;
  sunset: number | null;
};
export type WeatherSnapshot = {
  timezone: string;
  fetchedAt: number;
  current: {
    time: number;
    temperature: number | null;
    feelsLike: number | null;
    humidity: number | null;
    precipitation: number | null;
    wind: number | null;
    code: number | null;
    isDay: boolean | null;
    condition: WeatherCondition;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
};
export const WEATHER_REFRESH_MS = 20 * 60_000;
export const WEATHER_MAX_CACHE_MS = 6 * 60 * 60_000;
export const WEATHER_CACHE_KEY = "atmos-weather-cache-v1";

export function weatherCondition(
  code: number | null,
  rain: number | null = null,
  snowfall: number | null = null,
): WeatherCondition {
  if ((rain ?? 0) > 0 && (snowfall ?? 0) > 0) return "mixed";
  if (code === 0 || code === 1) return "sunny";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if ([65, 67, 82].includes(code ?? -1)) return "heavy-rain";
  if ([51, 53, 55, 56, 57, 61, 63, 66, 80, 81].includes(code ?? -1))
    return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return "snow";
  if ([95, 96, 97, 99].includes(code ?? -1)) return "thunderstorm";
  return "unknown";
}
const labels: Record<WeatherCondition, string> = {
  sunny: "Clear sky",
  "partly-cloudy": "Partly cloudy",
  overcast: "Overcast",
  rain: "Rain",
  "heavy-rain": "Heavy rain",
  snow: "Snow",
  mixed: "Rain & snow",
  fog: "Fog",
  thunderstorm: "Thunderstorm",
  unknown: "Conditions unavailable",
};
export function weatherLabel(
  condition: WeatherCondition,
  isDay: boolean | null = true,
) {
  return condition === "sunny" && isDay !== false
    ? "Clear skies"
    : labels[condition];
}
export function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function validLocation(value: unknown): value is WeatherLocation {
  if (!value || typeof value !== "object") return false;
  const v = value as WeatherLocation;
  return (
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= 120 &&
    Number.isFinite(v.latitude) &&
    Math.abs(v.latitude) <= 90 &&
    Number.isFinite(v.longitude) &&
    Math.abs(v.longitude) <= 180 &&
    (v.timezone === "auto" || validTimezone(v.timezone))
  );
}
export function locationKey(location: WeatherLocation) {
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)},${location.timezone}`;
}
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}
function number(
  value: unknown,
  min = -Infinity,
  max = Infinity,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}
function time(value: unknown) {
  const v = number(value, 1);
  return v === null ? null : v * 1000;
}
function dayFlag(value: unknown) {
  return value === 1 ? true : value === 0 ? false : null;
}
function item(value: unknown, index: number): unknown {
  return Array.isArray(value) ? value[index] : undefined;
}
/** Unix seconds avoid browser-timezone parsing and DST-offset errors. */
export function normalizeWeather(
  raw: unknown,
  fetchedAt = Date.now(),
): WeatherSnapshot {
  const data = record(raw),
    current = record(data.current),
    hourly = record(data.hourly),
    daily = record(data.daily);
  if (!validTimezone(data.timezone) || time(current.time) === null)
    throw new Error("Weather response is incomplete.");
  const code = number(current.weather_code, 0, 999);
  const hours: WeatherHour[] = (
    Array.isArray(hourly.time) ? hourly.time : []
  ).flatMap((v, i) => {
    const timestamp = time(v);
    return timestamp === null
      ? []
      : [
          {
            time: timestamp,
            temperature: number(item(hourly.temperature_2m, i), -100, 70),
            code: number(item(hourly.weather_code, i), 0, 999),
            isDay: dayFlag(item(hourly.is_day, i)),
          },
        ];
  });
  const days: WeatherDay[] = (
    Array.isArray(daily.time) ? daily.time : []
  ).flatMap((v, i) => {
    const timestamp = time(v);
    return timestamp === null
      ? []
      : [
          {
            time: timestamp,
            low: number(item(daily.temperature_2m_min, i), -100, 70),
            high: number(item(daily.temperature_2m_max, i), -100, 70),
            code: number(item(daily.weather_code, i), 0, 999),
            sunrise: time(item(daily.sunrise, i)),
            sunset: time(item(daily.sunset, i)),
          },
        ];
  });
  return {
    timezone: data.timezone,
    fetchedAt,
    current: {
      time: time(current.time)!,
      temperature: number(current.temperature_2m, -100, 70),
      feelsLike: number(current.apparent_temperature, -120, 90),
      humidity: number(current.relative_humidity_2m, 0, 100),
      precipitation: number(current.precipitation, 0),
      wind: number(current.wind_speed_10m, 0),
      code,
      isDay: dayFlag(current.is_day),
      condition: weatherCondition(
        code,
        number(current.rain, 0),
        number(current.snowfall, 0),
      ),
    },
    hourly: hours,
    daily: days,
  };
}
export function localDate(time: number, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export function localTime(time: number, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}
export function todayForecast(weather: WeatherSnapshot, now: number) {
  return weather.daily.find(
    (day) =>
      localDate(day.time, weather.timezone) ===
      localDate(now, weather.timezone),
  );
}
export function isWeatherStale(weather: WeatherSnapshot, now: number) {
  return (
    now - weather.fetchedAt > 30 * 60_000 ||
    now - weather.current.time > 45 * 60_000 ||
    weather.current.time - now > 5 * 60_000
  );
}
export function usableWeather(weather: WeatherSnapshot, now: number) {
  return (
    now - weather.fetchedAt >= -60_000 &&
    now - weather.fetchedAt <= WEATHER_MAX_CACHE_MS &&
    now - weather.current.time <= WEATHER_MAX_CACHE_MS &&
    weather.current.time - now <= 5 * 60_000
  );
}
export function dayPhase(weather: WeatherSnapshot, now: number): DayPhase {
  const today = todayForecast(weather, now);
  if (!today?.sunrise || !today?.sunset || today.sunset <= today.sunrise) {
    const hour = weather.hourly.find(
      (h) => h.time <= now && h.time + 3_600_000 > now,
    );
    const flag =
      hour?.isDay ??
      (!isWeatherStale(weather, now) ? weather.current.isDay : null);
    return flag === null ? "neutral" : flag ? "afternoon" : "night";
  }
  const { sunrise, sunset } = today;
  const twilight = 35 * 60_000;
  if (now < sunrise - twilight || now >= sunset + twilight) return "night";
  if (now < sunrise + 30 * 60_000) return "dawn";
  if (now >= sunset) return "dusk";
  if (now >= sunset - 60 * 60_000) return "golden-hour";
  return now < (sunrise + sunset) / 2 ? "morning" : "afternoon";
}
export function weatherUrl(location: WeatherLocation) {
  const query = new URLSearchParams({
    latitude: location.latitude.toFixed(3),
    longitude: location.longitude.toFixed(3),
    timezone: location.timezone,
    timeformat: "unixtime",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    forecast_days: "3",
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,snowfall,weather_code,wind_speed_10m,is_day",
    hourly: "temperature_2m,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
  });
  return `https://api.open-meteo.com/v1/forecast?${query}`;
}

type CacheEntry = { version: 1; key: string; raw: unknown; fetchedAt: number };
const memory = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<WeatherSnapshot>>();
function readEntry(location: WeatherLocation): CacheEntry | null {
  const key = locationKey(location);
  let entry: CacheEntry | undefined = memory.get(key);
  if (!entry && typeof window !== "undefined") {
    try {
      entry = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || "null");
    } catch {
      /* Storage is optional. */
    }
  }
  return entry?.version === 1 &&
    entry.key === key &&
    Number.isFinite(entry.fetchedAt)
    ? entry
    : null;
}
export function cachedWeather(
  location: WeatherLocation,
  now = Date.now(),
): WeatherSnapshot | null {
  const entry = readEntry(location);
  if (!entry) return null;
  try {
    const weather = normalizeWeather(entry.raw, entry.fetchedAt);
    return usableWeather(weather, now) ? weather : null;
  } catch {
    return null;
  }
}
export async function fetchJson(
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 12_000);
  const abort = () => timeout.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new Error("Weather service is temporarily unavailable.");
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
/** Shared promise + a 20-minute cache keep weather independent of sensor polling. */
export function fetchWeather(
  location: WeatherLocation,
): Promise<WeatherSnapshot> {
  const key = locationKey(location),
    cached = cachedWeather(location);
  if (
    cached &&
    Date.now() - cached.fetchedAt < WEATHER_REFRESH_MS &&
    !isWeatherStale(cached, Date.now())
  )
    return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetchJson(weatherUrl(location))
    .then((raw) => {
      const fetchedAt = Date.now(),
        weather = normalizeWeather(raw, fetchedAt);
      if (!usableWeather(weather, fetchedAt))
        throw new Error("The weather service returned outdated conditions.");
      const entry: CacheEntry = { version: 1, key, raw, fetchedAt };
      if (memory.size >= 4) memory.delete(memory.keys().next().value!);
      memory.set(key, entry);
      try {
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(entry));
      } catch {
        /* In-memory caching still works. */
      }
      return weather;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<WeatherLocation[]> {
  const params = new URLSearchParams({
    name: query.trim(),
    count: "5",
    language: "en",
    format: "json",
  });
  const raw = record(
    await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?${params}`,
      signal,
    ),
  );
  return (Array.isArray(raw.results) ? raw.results : []).flatMap((value) => {
    const v = record(value);
    const name = [v.name, v.admin1, v.country]
      .filter((x) => typeof x === "string")
      .join(", ")
      .slice(0, 120);
    const location = {
      name,
      latitude: v.latitude,
      longitude: v.longitude,
      timezone: v.timezone,
    };
    return validLocation(location)
      ? [
          {
            ...location,
            latitude: Math.round(location.latitude * 1000) / 1000,
            longitude: Math.round(location.longitude * 1000) / 1000,
          },
        ]
      : [];
  });
}
