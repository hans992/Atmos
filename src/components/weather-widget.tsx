"use client";
import { memo } from "react";
import Link from "next/link";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  Sun,
  Wind,
} from "lucide-react";
import {
  localDate,
  localTime,
  todayForecast,
  weatherCondition,
  weatherLabel,
  type WeatherCondition,
} from "@/lib/weather";
import { useAppearance } from "./appearance-provider";
import { useWeather } from "./weather-provider";
export function WeatherIcon({
  condition,
  isDay = true,
  size = 24,
}: {
  condition: WeatherCondition;
  isDay?: boolean | null;
  size?: number;
}) {
  const Icon =
    condition === "sunny"
      ? isDay === false
        ? Moon
        : Sun
      : condition === "partly-cloudy"
        ? isDay === false
          ? CloudMoon
          : CloudSun
        : (
            {
              overcast: Cloud,
              rain: CloudRain,
              "heavy-rain": CloudRainWind,
              snow: CloudSnow,
              mixed: CloudDrizzle,
              fog: CloudFog,
              thunderstorm: CloudLightning,
              unknown: Cloud,
            } as const
          )[condition];
  return <Icon size={size} strokeWidth={1.45} aria-hidden="true" />;
}
function value(v: number | null | undefined, decimals = 0) {
  return v == null ? "—" : v.toFixed(decimals);
}
export const WeatherWidget = memo(function WeatherWidget() {
  const { preferences } = useAppearance();
  const { weather, loading, error, stale, now, refresh } = useWeather();
  const location = preferences.location;
  const today = weather ? todayForecast(weather, now) : null;
  const hours = weather?.hourly.filter((h) => h.time > now).slice(0, 6) ?? [];
  const days =
    weather?.daily
      .filter(
        (d) =>
          localDate(d.time, weather.timezone) >=
          localDate(now, weather.timezone),
      )
      .slice(0, 3) ?? [];
  return (
    <section
      className="weather-widget glass-surface"
      aria-label="Outdoor weather"
      aria-busy={loading}
    >
      <div className="weather-heading">
        <span>
          <MapPin size={13} /> Outside
        </span>
        <Link
          href="/?view=settings#weather-location"
          title="Change weather location"
        >
          {location?.name ?? "Set your location"}
        </Link>
      </div>
      {!weather ? (
        <div className="weather-placeholder" role="status">
          <CloudSun size={35} strokeWidth={1.2} />
          <div>
            <strong>
              {!location
                ? "A view beyond your rooms."
                : loading
                  ? "Looking outside…"
                  : "Weather is unavailable"}
            </strong>
            <p>
              {!location
                ? "Choose a location to bring your local weather home."
                : loading
                  ? "Gathering the latest forecast."
                  : "You can still explore your rooms."}
            </p>
            {!location ? (
              <Link
                className="weather-text-link"
                href="/?view=settings#weather-location"
              >
                Choose a location →
              </Link>
            ) : (
              !loading && (
                <button className="weather-text-link" onClick={refresh}>
                  Try again
                </button>
              )
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="weather-current">
            <WeatherIcon
              condition={weather.current.condition}
              isDay={weather.current.isDay}
              size={47}
            />
            <div>
              <div className="weather-temperature">
                {value(weather.current.temperature, 1)}
                <span>°C</span>
              </div>
              <p>
                {weatherLabel(weather.current.condition, weather.current.isDay)}
              </p>
            </div>
            <div className="weather-range">
              <span>H {value(today?.high)}°</span>
              <span>L {value(today?.low)}°</span>
            </div>
          </div>
          <div className="weather-facts">
            <span>Feels {value(weather.current.feelsLike)}°</span>
            <span>
              <Droplets size={13} />
              {value(weather.current.humidity)}%
            </span>
            <span>
              <Wind size={14} />
              {value(weather.current.wind)} km/h
            </span>
          </div>
          {hours.length > 0 && (
            <div className="weather-hours" aria-label="Next six hours">
              {hours.map((hour) => (
                <div key={hour.time}>
                  <span>{localTime(hour.time, weather.timezone)}</span>
                  <WeatherIcon
                    condition={weatherCondition(hour.code)}
                    isDay={hour.isDay}
                    size={19}
                  />
                  <strong>{value(hour.temperature)}°</strong>
                  <span className="sr-only">
                    {weatherLabel(weatherCondition(hour.code), hour.isDay)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <details className="weather-details">
            <summary>
              3-day outlook <span>{stale ? "Saved forecast" : "Forecast"}</span>
            </summary>
            <div className="weather-days">
              {days.map((day) => (
                <div key={day.time}>
                  <span>
                    {localDate(day.time, weather.timezone) ===
                    localDate(now, weather.timezone)
                      ? "Today"
                      : new Intl.DateTimeFormat("en-GB", {
                          weekday: "short",
                          timeZone: weather.timezone,
                        }).format(day.time)}
                  </span>
                  <WeatherIcon
                    condition={weatherCondition(day.code)}
                    size={18}
                  />
                  <span className="sr-only">
                    {weatherLabel(weatherCondition(day.code))}
                  </span>
                  <strong>
                    {value(day.high)}° <span>/ {value(day.low)}°</span>
                  </strong>
                </div>
              ))}
            </div>
            <p className="weather-sun-times">
              Sunrise{" "}
              {today?.sunrise
                ? localTime(today.sunrise, weather.timezone)
                : "—"}{" "}
              · Sunset{" "}
              {today?.sunset ? localTime(today.sunset, weather.timezone) : "—"}
              <br />
              Precipitation {value(weather.current.precipitation, 1)} mm ·{" "}
              {weather.timezone}
            </p>
          </details>
          {(stale || error) && (
            <div className="weather-notice" role="status">
              <span>
                {stale ? "Saved weather · may be out of date." : error}
              </span>
              <button onClick={refresh} disabled={loading}>
                Retry
              </button>
            </div>
          )}
        </>
      )}
      <div className="weather-credit">
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Weather by Open-Meteo
        </a>
        {weather && (
          <span title={new Date(weather.current.time).toISOString()}>
            As of {localTime(weather.current.time, weather.timezone)}
          </span>
        )}
      </div>
    </section>
  );
});
