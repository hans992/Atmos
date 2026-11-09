"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  parseTheme,
  type Appearance,
  type Theme,
} from "@/lib/appearance";
type AppearanceContext = {
  preferences: Appearance;
  update: (value: Partial<Appearance>) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  dark: boolean;
  ready: boolean;
  storageWarning: boolean;
};
const Context = createContext<AppearanceContext | null>(null);
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_APPEARANCE);
  const [theme, setThemeState] = useState<Theme>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    try {
      setPreferences(
        parseAppearance(
          JSON.parse(localStorage.getItem(APPEARANCE_KEY) || "null"),
        ),
      );
      setThemeState(parseTheme(localStorage.getItem("atmos-theme")));
    } catch {
      setStorageWarning(true);
    }
    const media = matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    const storage = (event: StorageEvent) => {
      if (event.key === "atmos-theme")
        setThemeState(parseTheme(event.newValue));
      if (event.key === APPEARANCE_KEY) {
        try {
          setPreferences(parseAppearance(JSON.parse(event.newValue || "null")));
        } catch {
          /* Ignore corrupt cross-tab values. */
        }
      }
    };
    window.addEventListener("storage", storage);
    setReady(true);
    return () => {
      media.removeEventListener("change", change);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const dark = theme === "system" ? systemDark : theme === "dark";
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.atmosphere = preferences.dynamic
      ? "enabled"
      : "disabled";
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => {
        meta.content = dark ? "#172c2d" : "#e6eeea";
      });
  }, [dark, ready, preferences.dynamic]);
  function setTheme(value: Theme) {
    setThemeState(value);
    try {
      localStorage.setItem("atmos-theme", value);
    } catch {
      setStorageWarning(true);
    }
  }
  function update(value: Partial<Appearance>) {
    const next = parseAppearance({ ...preferences, ...value });
    setPreferences(next);
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
    } catch {
      setStorageWarning(true);
    }
  }
  return (
    <Context.Provider
      value={{
        preferences,
        update,
        theme,
        setTheme,
        dark,
        ready,
        storageWarning,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing AppearanceProvider");
  return value;
}
