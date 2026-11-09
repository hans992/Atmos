"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleHelp,
  House,
  LayoutGrid,
  Leaf,
  Moon,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sun,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useClimate } from "./climate-provider";
import { InstallButton } from "./pwa";
import { useAppearance } from "./appearance-provider";
import { WeatherAtmosphere } from "./weather-atmosphere";
const navigation = [
  { label: "Home", icon: House, view: "overview" },
  { label: "Rooms", icon: LayoutGrid, view: "rooms" },
  { label: "History", icon: ChartNoAxesCombined, view: "insights" },
  { label: "Settings", icon: Settings2, view: "settings" },
];
function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Atmos home">
      <span className="brand-mark">
        <Activity size={23} strokeWidth={1.8} />
      </span>
      atmos<span className="brand-period">.</span>
    </Link>
  );
}
function HomeActions() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="home-actions"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className={`icon-button add-button ${open ? "is-open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Home actions"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="home-actions-panel"
      >
        <Plus size={22} />
      </button>
      {open && (
        <div
          id="home-actions-panel"
          ref={panel}
          className="action-panel"
          role="dialog"
          aria-label="Home actions"
        >
          <div className="action-panel-heading">
            <span>Make it your home</span>
            <button
              className="icon-button"
              onClick={close}
              aria-label="Close home actions"
            >
              <X size={17} />
            </button>
          </div>
          <Link
            href="/?view=help"
            className="action-item"
            onClick={() => setOpen(false)}
          >
            <Wifi size={20} />
            <span>
              Add a device<small>Open the sensor setup guide</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          {[
            { label: "Add a room", icon: LayoutGrid },
            { label: "Add an automation", icon: Zap },
            { label: "Calibrate a sensor", icon: SlidersHorizontal },
            { label: "Add another home", icon: House },
          ].map(({ label, icon: Icon }) => (
            <button className="action-item" key={label} disabled>
              <Icon size={20} />
              <span>{label}</span>
              <small className="soon-label">Coming soon</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const view = pathname.startsWith("/room")
    ? "rooms"
    : search.get("view") || "overview";
  const { demo, now, loading, refresh, connected } = useClimate();
  const { dark, setTheme } = useAppearance();
  function theme() {
    setTheme(dark ? "light" : "dark");
  }
  return (
    <div className="app-shell">
      <WeatherAtmosphere />
      <aside className="sidebar">
        <Brand />
        <div className="home-identity">
          <span className="home-icon">
            <House size={21} />
          </span>
          <div>
            <strong>My home</strong>
            <small>Your everyday atmosphere</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon, view: key }) => (
            <Link
              key={key}
              href={key === "overview" ? "/" : `/?view=${key}`}
              className={`nav-item ${view === key ? "active" : ""}`}
              aria-current={view === key ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{label}</span>
              {view === key && <span className="active-dot" />}
            </Link>
          ))}
          <Link
            href="/?view=devices"
            className={`nav-item ${view === "devices" ? "active" : ""}`}
            aria-current={view === "devices" ? "page" : undefined}
          >
            <Wifi size={20} strokeWidth={1.7} />
            Sensors
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={24} strokeWidth={1.5} />
            <strong>
              A little awareness.
              <br />A better home.
            </strong>
            <p>Comfort, one room at a time.</p>
          </div>
          <Link
            href="/?view=help"
            className={`nav-item ${view === "help" ? "active" : ""}`}
          >
            <CircleHelp size={19} />
            Help & setup
            <ArrowUpRight size={15} />
          </Link>
          <div className="sidebar-profile">
            <span className="profile-dot" />
            <span>
              {demo ? "Sample home" : "Private home"}
              <small>ESP32-C3 · SHT31</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="desktop-context">
            <House size={16} />
            <span>My home</span>
            <span className="slash">/</span>
            <strong>
              {navigation.find((n) => n.view === view)?.label ??
                (view === "devices" ? "Sensors" : "Help & setup")}
            </strong>
          </div>
          <div className="header-actions">
            <span className="header-date">
              {now
                ? new Date(now).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                  })
                : ""}
            </span>
            <span
              className={`connection-pill ${!connected ? "disconnected" : ""}`}
            >
              <span />
              {!connected ? "Offline" : demo ? "Demo" : "Connected"}
            </span>
            <button
              className="icon-button refresh-button"
              onClick={refresh}
              aria-label="Refresh readings"
              title="Refresh readings"
              disabled={loading}
            >
              <RefreshCw size={18} className={loading ? "spin" : ""} />
            </button>
            <button
              className="icon-button theme-button"
              onClick={theme}
              aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
              title={`Switch to ${dark ? "light" : "dark"} mode`}
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <HomeActions />
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer className="page-footer">
          <span>
            <span className="tiny-brand">a.</span>A little awareness. A better
            home.
          </span>
          <InstallButton />
          <span>Designed around your everyday.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ label, icon: Icon, view: key }) => (
          <Link
            key={key}
            href={key === "overview" ? "/" : `/?view=${key}`}
            aria-current={view === key ? "page" : undefined}
            className={view === key ? "active" : ""}
          >
            <Icon size={21} strokeWidth={view === key ? 2 : 1.6} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
