import test from "node:test";
import assert from "node:assert/strict";
import {
  cachedWeather,
  dayPhase,
  fetchWeather,
  isWeatherStale,
  localDate,
  localTime,
  normalizeWeather,
  todayForecast,
  usableWeather,
  weatherCondition,
  weatherUrl,
  type WeatherLocation,
} from "../src/lib/weather";
import {
  DEFAULT_LOCATION,
  parseAppearance,
  parseTheme,
} from "../src/lib/appearance";
const at = (iso: string) => Date.parse(iso) / 1000;
function fixture(now = Date.parse("2026-11-09T12:00:00Z")) {
  return {
    timezone: "Europe/Berlin",
    current: {
      time: now / 1000,
      temperature_2m: 9.4,
      apparent_temperature: 7.3,
      relative_humidity_2m: 82,
      precipitation: 0.2,
      rain: 0.2,
      snowfall: 0,
      weather_code: 61,
      wind_speed_10m: 12,
      is_day: 1,
    },
    hourly: {
      time: [now / 1000],
      temperature_2m: [10],
      weather_code: [61],
      is_day: [1],
    },
    daily: {
      time: [at("2026-11-08T23:00:00Z")],
      temperature_2m_min: [5],
      temperature_2m_max: [11],
      sunrise: [at("2026-11-09T06:40:00Z")],
      sunset: [at("2026-11-09T15:52:00Z")],
      weather_code: [61],
    },
  };
}
test("WMO weather states, mixed precipitation and unknown codes are explicit", () => {
  for (const [code, expected] of [
    [0, "sunny"],
    [1, "sunny"],
    [2, "partly-cloudy"],
    [3, "overcast"],
    [45, "fog"],
    [48, "fog"],
    [51, "rain"],
    [61, "rain"],
    [67, "heavy-rain"],
    [82, "heavy-rain"],
    [75, "snow"],
    [86, "snow"],
    [95, "thunderstorm"],
    [97, "thunderstorm"],
    [999, "unknown"],
  ] as const)
    assert.equal(weatherCondition(code), expected);
  assert.equal(weatherCondition(71, 0.2, 0.1), "mixed");
  assert.equal(weatherCondition(null), "unknown");
});
test("API parsing never turns missing or invalid measurements into zero", () => {
  const raw = fixture();
  const weather = normalizeWeather({
    ...raw,
    current: {
      ...raw.current,
      temperature_2m: null,
      relative_humidity_2m: 102,
      precipitation: null,
      wind_speed_10m: -5,
      weather_code: null,
    },
    daily: { ...raw.daily, sunrise: [null] },
  });
  assert.equal(weather.current.temperature, null);
  assert.equal(weather.current.humidity, null);
  assert.equal(weather.current.precipitation, null);
  assert.equal(weather.current.wind, null);
  assert.equal(weather.current.condition, "unknown");
  assert.equal(weather.daily[0].sunrise, null);
  assert.throws(() => normalizeWeather({}), /incomplete/);
  assert.throws(
    () => normalizeWeather({ ...raw, timezone: "invalid" }),
    /incomplete/,
  );
});
test("location time and solar transitions use Unix timestamps, independent of browser timezone", () => {
  const now = Date.parse("2026-11-09T12:00:00Z"),
    weather = normalizeWeather(fixture(now), now);
  assert.equal(todayForecast(weather, now)?.high, 11);
  assert.equal(
    localTime(Date.parse("2026-11-09T22:15:00Z"), "Europe/Berlin"),
    "23:15",
  );
  assert.equal(
    localTime(Date.parse("2026-10-25T00:30:00Z"), "Europe/Berlin"),
    "02:30",
  );
  assert.equal(
    localTime(Date.parse("2026-10-25T01:30:00Z"), "Europe/Berlin"),
    "02:30",
  );
  assert.notEqual(
    localDate(Date.parse("2026-11-09T23:15:00Z"), "Europe/Berlin"),
    localDate(now, "Europe/Berlin"),
  );
  for (const [hour, phase] of [
    ["06:10", "dawn"],
    ["08:00", "morning"],
    ["13:00", "afternoon"],
    ["15:15", "golden-hour"],
    ["16:00", "dusk"],
    ["18:00", "night"],
  ] as const)
    assert.equal(
      dayPhase(weather, Date.parse(`2026-11-09T${hour}:00Z`)),
      phase,
    );
  const polar = {
    ...weather,
    daily: weather.daily.map((d) => ({ ...d, sunrise: null, sunset: null })),
    current: { ...weather.current, isDay: false },
    hourly: [],
  };
  assert.equal(dayPhase(polar, now), "night");
});
test("stale and expired weather are not treated as current, including future clock errors", () => {
  const now = Date.parse("2026-11-09T12:00:00Z"),
    weather = normalizeWeather(fixture(now), now);
  assert.equal(isWeatherStale(weather, now), false);
  assert.equal(isWeatherStale(weather, now + 31 * 60_000), true);
  assert.equal(usableWeather(weather, now + 7 * 3_600_000), false);
  assert.equal(usableWeather(weather, now - 600_000), false);
});
test("preferences recover safely and preserve explicit removal, system mode, and coordinate boundaries", () => {
  assert.equal(parseTheme("system"), "system");
  assert.equal(parseTheme("broken"), "system");
  assert.equal(
    parseAppearance({ location: null, dynamic: false }).location,
    null,
  );
  assert.equal(
    parseAppearance({ location: null, dynamic: false }).dynamic,
    false,
  );
  assert.deepEqual(
    parseAppearance({ location: { ...DEFAULT_LOCATION, latitude: 91 } })
      .location,
    DEFAULT_LOCATION,
  );
  assert.equal(
    parseAppearance({
      location: { name: "Zero", latitude: 0, longitude: 0, timezone: "auto" },
    }).location?.latitude,
    0,
  );
  const url = new URL(weatherUrl(DEFAULT_LOCATION));
  assert.equal(url.searchParams.get("timeformat"), "unixtime");
  assert.equal(url.searchParams.get("temperature_unit"), "celsius");
});
test("parallel weather consumers share one request and fresh cache; other locations cannot reuse it", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(JSON.stringify(fixture(Date.now())), { status: 200 });
  };
  const location: WeatherLocation = {
    name: "Test",
    latitude: 1.234,
    longitude: 2.345,
    timezone: "Europe/Berlin",
  };
  try {
    const [a, b] = await Promise.all([
      fetchWeather(location),
      fetchWeather(location),
    ]);
    assert.deepEqual(a, b);
    assert.equal(calls, 1);
    await fetchWeather(location);
    assert.equal(calls, 1);
    assert.equal(cachedWeather({ ...location, longitude: 3.456 }), null);
    await fetchWeather({ ...location, longitude: 3.456 });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("weather outages preserve a valid cached response and malformed responses never poison it", async () => {
  const original = globalThis.fetch;
  const originalNow = Date.now;
  const now = Date.now();
  const location: WeatherLocation = {
    name: "Failure test",
    latitude: 4.567,
    longitude: 5.678,
    timezone: "auto",
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({}), { status: 200 });
  try {
    await assert.rejects(fetchWeather(location), /incomplete/);
    assert.equal(cachedWeather(location), null);
    globalThis.fetch = async () => new Response(JSON.stringify(fixture(now)), { status: 200 });
    const saved = await fetchWeather(location);
    Date.now = () => now + 31 * 60_000;
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    await assert.rejects(fetchWeather(location), /unavailable/);
    assert.deepEqual(cachedWeather(location), saved);
    assert.equal(isWeatherStale(cachedWeather(location)!, Date.now()), true);
    Date.now = () => now + 7 * 3_600_000;
    assert.equal(cachedWeather(location), null);
  } finally {
    globalThis.fetch = original;
    Date.now = originalNow;
  }
});
