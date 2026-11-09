"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, LocateFixed, MapPin, Palette, Search } from "lucide-react";
import {
  searchLocations,
  validLocation,
  WEATHER_CACHE_KEY,
  type WeatherLocation,
} from "@/lib/weather";
import type { Theme } from "@/lib/appearance";
import { useAppearance } from "./appearance-provider";
function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="appearance-choice">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label
            key={option.value}
            className={value === option.value ? "selected" : ""}
          >
            <input
              type="radio"
              name={label}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
            {value === option.value && <Check size={14} aria-hidden="true" />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function AtmosphereSettings() {
  const {
    preferences: p,
    update,
    theme,
    setTheme,
    storageWarning,
  } = useAppearance();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [name, setName] = useState("");
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    setLatitude(p.location?.latitude.toString() ?? "");
    setLongitude(p.location?.longitude.toString() ?? "");
    setName(p.location?.name ?? "");
  }, [p.location]);
  useEffect(
    () => () => {
      abort.current?.abort();
      generation.current++;
    },
    [],
  );
  function choose(location: WeatherLocation | null) {
    generation.current++;
    abort.current?.abort();
    setBusy(false);
    update({ location });
    setResults([]);
    setError("");
    setMessage(
      location
        ? `Weather location saved: ${location.name}.`
        : "Weather location removed. Using a neutral atmosphere.",
    );
    try {
      localStorage.removeItem(WEATHER_CACHE_KEY);
    } catch {
      /* Storage may be unavailable. */
    }
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    abort.current?.abort();
    abort.current = new AbortController();
    const request = ++generation.current;
    setBusy(true);
    setResults([]);
    setError("");
    setMessage("");
    try {
      const matches = await searchLocations(query, abort.current.signal);
      if (request !== generation.current) return;
      setResults(matches);
      setMessage(
        matches.length
          ? "Choose your location below."
          : "No matches. Try the city name, or enter coordinates.",
      );
    } catch {
      if (request === generation.current)
        setError(
          "Location search is unavailable. Try again or enter coordinates.",
        );
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  function coordinates(event: FormEvent) {
    event.preventDefault();
    const location = {
      name: name.trim() || "My weather location",
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone: "auto",
    };
    if (!latitude.trim() || !longitude.trim() || !validLocation(location)) {
      setError(
        "Enter a latitude from −90 to 90 and a longitude from −180 to 180.",
      );
      return;
    }
    choose({
      ...location,
      latitude: Math.round(location.latitude * 1000) / 1000,
      longitude: Math.round(location.longitude * 1000) / 1000,
    });
  }
  function detect() {
    if (!navigator.geolocation) {
      setError(
        "Location detection isn’t available in this browser. Use city search or coordinates.",
      );
      return;
    }
    abort.current?.abort();
    const request = ++generation.current;
    setBusy(true);
    setMessage("Waiting for location permission…");
    setError("");
    setResults([]);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== generation.current) return;
        choose({
          name: "My location",
          latitude: Math.round(position.coords.latitude * 1000) / 1000,
          longitude: Math.round(position.coords.longitude * 1000) / 1000,
          timezone: "auto",
        });
      },
      () => {
        if (request === generation.current) {
          setBusy(false);
          setMessage("");
          setError(
            "Location wasn’t available or permission was declined. You can enter a city instead.",
          );
        }
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  }
  return (
    <section className="panel settings-panel atmosphere-settings">
      <div className="settings-icon">
        <Palette size={22} />
      </div>
      <h2>Appearance & Atmosphere</h2>
      <p>A little closer to the world outside. Make the view feel like home.</p>
      <div className="appearance-columns">
        <div className="appearance-controls">
          <Choices<Theme>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
          />
          <Choices
            label="Dynamic background"
            value={p.dynamic ? "enabled" : "disabled"}
            onChange={(value) => update({ dynamic: value === "enabled" })}
            options={[
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
          <Choices
            label="Animation intensity"
            value={p.intensity}
            onChange={(intensity) => update({ intensity })}
            options={[
              { value: "off", label: "Off" },
              { value: "subtle", label: "Subtle" },
              { value: "standard", label: "Standard" },
            ]}
          />
          <Choices
            label="Weather synchronization"
            value={p.synchronization}
            onChange={(synchronization) => update({ synchronization })}
            options={[
              { value: "live", label: "Live weather" },
              { value: "static", label: "Static atmosphere" },
            ]}
          />
          <Choices
            label="Background style"
            value={p.background}
            onChange={(background) => update({ background })}
            options={[
              { value: "garden", label: "Nature / Garden" },
              { value: "gradient", label: "Minimal gradient" },
            ]}
          />
          <p className="small-note">
            Your theme controls the interface; local weather controls the
            scenery. Static atmosphere keeps a neutral view. The weather widget
            still updates every 20 minutes. Reduced motion is always respected.
          </p>
        </div>
        <div className="weather-location-settings" id="weather-location">
          <h3>
            <MapPin size={18} /> Weather location
          </h3>
          <div className="saved-location">
            <strong>{p.location?.name ?? "No location configured"}</strong>
            {p.location && (
              <span>
                {p.location.latitude.toFixed(3)},{" "}
                {p.location.longitude.toFixed(3)} ·{" "}
                {p.location.timezone === "auto"
                  ? "Automatic local timezone"
                  : p.location.timezone}
              </span>
            )}
          </div>
          <form onSubmit={search} className="location-search">
            <label htmlFor="city-search">City or postal code</label>
            <div>
              <input
                id="city-search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  abort.current?.abort();
                  generation.current++;
                  setBusy(false);
                  setResults([]);
                }}
                placeholder="e.g. Rheinhausen, Germany"
                minLength={2}
                maxLength={100}
                required
              />
              <button
                className="button"
                type="submit"
                disabled={busy || query.trim().length < 2}
              >
                <Search size={16} />
                Search
              </button>
            </div>
          </form>
          {results.length > 0 && (
            <ul
              className="location-results"
              aria-label="Location search results"
            >
              {results.map((result) => (
                <li key={`${result.latitude},${result.longitude}`}>
                  <button type="button" onClick={() => choose(result)}>
                    <MapPin size={15} />
                    <span>
                      {result.name}
                      <small>{result.timezone}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <details className="coordinate-details">
            <summary>Enter coordinates instead</summary>
            <form onSubmit={coordinates}>
              <label>
                Location name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="My home"
                />
              </label>
              <div className="coordinate-inputs">
                <label>
                  Latitude
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    required
                  />
                </label>
              </div>
              <button className="button" type="submit">
                Save coordinates
              </button>
            </form>
          </details>
          <div className="location-actions">
            <button
              type="button"
              className="button"
              onClick={detect}
              disabled={busy}
            >
              <LocateFixed size={16} />
              Use browser location
            </button>
            {p.location && (
              <button
                className="weather-text-link"
                type="button"
                onClick={() => choose(null)}
              >
                Remove location
              </button>
            )}
          </div>
          <p className="small-note">
            Optional detection asks for permission. Only a name, rounded
            coordinates and timezone are stored on this browser. Open-Meteo
            receives coordinates for the forecast; city searches use its
            geocoding service.
          </p>
          <div className="location-feedback" aria-live="polite">
            {busy && !message ? "Searching…" : message}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <p className="appearance-storage-note">
        {storageWarning
          ? "Browser storage is unavailable. These settings may reset when you leave."
          : "Preferences are saved on this browser."}
      </p>
    </section>
  );
}
