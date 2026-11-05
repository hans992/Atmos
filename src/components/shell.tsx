"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  House,
  LayoutGrid,
  Menu,
  Moon,
  RefreshCw,
  Settings2,
  Sprout,
  Sun,
  Wifi,
  X,
} from "lucide-react";
import { useClimate } from "./climate-provider";
import { InstallButton } from "./pwa";
const navigation = [
  { label: "Overview", icon: LayoutGrid, view: "overview" },
  { label: "Rooms", icon: House, view: "rooms" },
  { label: "Insights", icon: Activity, view: "insights" },
  { label: "Devices", icon: Wifi, view: "devices" },
];
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const view =
    pathname === "/room/" || pathname === "/room"
      ? "rooms"
      : search.get("view") || "overview";
  const { demo, now, loading, refresh, connected } = useClimate();
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  function theme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("atmos-theme", next ? "dark" : "light");
    } catch {}
  }
  useEffect(() => {
    setMenu(false);
  }, [pathname, view]);
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        className={`sidebar ${menu ? "sidebar-open" : ""}`}
        inert={mobile && !menu}
      >
        <Link href="/" className="brand" aria-label="Atmos home">
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          atmos<span className="brand-period">.</span>
        </Link>
        <button
          className="sidebar-close icon-button"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <div className="home-switch">
          <button
            onClick={() => setHomeOpen(!homeOpen)}
            aria-expanded={homeOpen}
          >
            <span className="home-icon">
              <House size={18} />
            </span>
            <span>
              <strong>My home</strong>
              <small>Your personal space</small>
            </span>
            <ChevronDown size={14} />
          </button>
          {homeOpen && (
            <div className="home-popover">
              One home. Every room connected.
              <br />
              <Link href="/?view=settings" onClick={() => setHomeOpen(false)}>
                Manage connection <ArrowUpRight size={13} />
              </Link>
            </div>
          )}
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon, view: key }) => (
            <Link
              href={key === "overview" ? "/" : `/?view=${key}`}
              className={view === key ? "nav-item active" : "nav-item"}
              key={key}
            >
              <Icon size={19} strokeWidth={1.7} />
              {label}
              {key === "rooms" && (
                <span className="nav-count">
                  <RoomCount />
                </span>
              )}
              {key === "overview" && <span className="active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="note-leaf">
              <Sprout size={20} />
            </div>
            <strong>
              A happier home starts
              <br />
              with a little awareness.
            </strong>
            <p>Small insights. Everyday comfort.</p>
            <InstallButton />
          </div>
          <Link
            className={view === "settings" ? "nav-item active" : "nav-item"}
            href="/?view=settings"
          >
            <Settings2 size={19} />
            Settings
          </Link>
          <Link className="nav-item" href="/?view=help">
            <CircleHelp size={19} />
            Help & getting started
            <ArrowUpRight size={13} />
          </Link>
          <div className="sidebar-profile">
            <span className="avatar">H</span>
            <div>
              <strong>Home workspace</strong>
              <small>{demo ? "Demo experience" : "Private dashboard"}</small>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <House size={15} />
            <span>My home</span>
            <span className="slash">/</span>
            <strong>{view.charAt(0).toUpperCase() + view.slice(1)}</strong>
          </div>
          <div className="header-actions">
            <span className="header-date">
              {now
                ? new Date(now).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : ""}
            </span>
            <span
              className={`connection-pill ${!connected ? "disconnected" : ""}`}
            >
              <span />
              {!connected ? "Offline" : demo ? "Demo mode" : "Connected"}
            </span>
            <button
              className="icon-button"
              onClick={refresh}
              aria-label="Refresh readings"
              title="Refresh readings"
              disabled={loading}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            <button
              className="icon-button theme-button"
              onClick={theme}
              aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
              title={`Switch to ${dark ? "light" : "dark"} mode`}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer className="page-footer">
          <span>
            <span className="tiny-brand">a.</span> A little awareness. A better
            home.
          </span>
          <span>Made for your everyday atmosphere.</span>
        </footer>
      </div>
    </div>
  );
}
function RoomCount() {
  return <>{useClimate().rooms.length}</>;
}
