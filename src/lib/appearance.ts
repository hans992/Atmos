import { validLocation, type WeatherLocation } from "./weather";
export type Theme = "light" | "dark" | "system";
export type Appearance = {
  dynamic: boolean;
  intensity: "off" | "subtle" | "standard";
  synchronization: "live" | "static";
  background: "garden" | "gradient";
  location: WeatherLocation | null;
};
export const APPEARANCE_KEY = "atmos-appearance-v1";
/** District centre, explicitly selected by the owner; no precise home address. */
export const DEFAULT_LOCATION: WeatherLocation = {
  name: "Duisburg–Rheinhausen",
  latitude: 51.401,
  longitude: 6.712,
  timezone: "Europe/Berlin",
};
export const DEFAULT_APPEARANCE: Appearance = {
  dynamic: true,
  intensity: "subtle",
  synchronization: "live",
  background: "garden",
  location: DEFAULT_LOCATION,
};
export function parseAppearance(raw: unknown): Appearance {
  const v = raw && typeof raw === "object" ? (raw as Partial<Appearance>) : {};
  return {
    dynamic: typeof v.dynamic === "boolean" ? v.dynamic : true,
    intensity:
      v.intensity === "off" || v.intensity === "standard"
        ? v.intensity
        : "subtle",
    synchronization: v.synchronization === "static" ? "static" : "live",
    background: v.background === "gradient" ? "gradient" : "garden",
    location:
      v.location === null
        ? null
        : validLocation(v.location)
          ? v.location
          : DEFAULT_LOCATION,
  };
}
export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
