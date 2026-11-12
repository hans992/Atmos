"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  Droplets,
  House,
  Leaf,
  Search,
  ShieldCheck,
  Sprout,
  Thermometer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useClimate } from "./climate-provider";
import { HistoryChart } from "./history-chart";
import { RoomCard, RoomIcon, StatusBadge } from "./room-card";
import { display, isOnline, mean, relativeTime, statusOf } from "@/lib/climate";
import { getSupabase } from "@/lib/supabase";
import { isOutdoor, roomTone } from "@/lib/room-presentation";
import { WeatherWidget } from "./weather-widget";
import { ClimateInsights, useComfortPreferences } from "./climate-insights";
import { AtmosphereSettings } from "./atmosphere-settings";

export function DataNotice() {
  const { error, demo, connected, refresh, refreshed } = useClimate();
  return (
    <>
      {!connected && (
        <div className="alert-banner" role="status">
          <WifiOff size={17} />
          You’re offline. Displayed readings may be out of date.
        </div>
      )}
      {error && (
        <div className="alert-banner" role="alert">
          <CircleAlert size={17} />
          <span>
            Couldn’t refresh readings.{" "}
            {refreshed ? "Showing the last successful update. " : ""}
            {error}
          </span>
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      {demo && (
        <div className="demo-note">
          <span className="demo-dot" />
          You’re exploring a sample home.
          <Link href="/?view=settings">
            Connect your sensors <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </>
  );
}
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { demo, session, authReady, loading, rooms } = useClimate();
  if (!authReady || (loading && !rooms.length))
    return (
      <div className="loading-state">
        <span className="loading-orbit" />
        <h2>Getting your home ready</h2>
        <p>Gathering the latest room readings…</p>
      </div>
    );
  if (!demo && !session)
    return (
      <div className="signin-page">
        <div className="eyebrow">YOUR PRIVATE SPACE</div>
        <h1>Welcome home.</h1>
        <p>Sign in to see your home’s climate.</p>
        <SignIn />
      </div>
    );
  return <>{children}</>;
}
export function Dashboard() {
  const params = useSearchParams();
  const view = params.get("view") || "overview";
  if (view === "settings") return <Settings />;
  if (view === "help") return <Help />;
  return (
    <AuthGate>
      <DataNotice />
      {view === "devices" ? (
        <Devices />
      ) : view === "insights" ? (
        <>
          <PageTitle
            eyebrow="A LITTLE PERSPECTIVE"
            title="Your home over time."
            subtitle="Explore how your temperature and humidity change over time."
          />
          <HistoryChart />
          <div className="info-note">
            <Leaf size={18} />
            <span>
              Home averages include readings from active devices. Open a room to
              explore its individual history.
            </span>
          </div>
        </>
      ) : (
        <Overview key={view} roomsOnly={view === "rooms"} />
      )}
    </AuthGate>
  );
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
function Overview({ roomsOnly }: { roomsOnly: boolean }) {
  const comfortPreferences = useComfortPreferences();
  const { rooms, now, loading, refreshed } = useClimate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const online = rooms.filter((r) => isOnline(r, now));
  const indoors = online.filter((r) => !isOutdoor(r.room));
  const comfortable = indoors.filter((r) => statusOf(r, now, comfortPreferences[r.id]) === "comfortable");
  const needsAttention = indoors.filter(
    (r) => statusOf(r, now, comfortPreferences[r.id]) !== "comfortable",
  );
  const temperatures = indoors.map((r) => r.latest!.temperature);
  const filtered = rooms.filter(
    (r) =>
      r.room.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "attention"
          ? !isOnline(r, now) ||
            (!isOutdoor(r.room) && statusOf(r, now, comfortPreferences[r.id]) !== "comfortable")
          : isOnline(r, now))),
  );
  return (
    <>
      <section
        className={
          "home-hero " + (roomsOnly ? "rooms-hero" : "weather-home-hero")
        }
      >
        <div className="hero-intro">
          <div className="eyebrow">
            {roomsOnly ? "EVERY SPACE, CONNECTED" : "YOUR EVERYDAY ATMOSPHERE"}
          </div>
          <h1>{roomsOnly ? "Your rooms." : "My home."}</h1>
          <p>
            {roomsOnly
              ? "A little insight into every corner."
              : "A calmer home starts with a little clarity."}
          </p>
          <span className="auto-update">
            <span className="pulse-dot" />
            {loading
              ? "Refreshing readings…"
              : online.length + " of " + rooms.length + " sensors online"}
            <span className="auto-update-divider">·</span>Updates every minute
          </span>
        </div>
        {!roomsOnly && (
          <div className="hero-climate">
            <div className="hero-climate-main">
              <span className="metric-label">
                <Thermometer size={16} /> Indoor temperature
              </span>
              <div className="hero-temperature">
                {display(mean(temperatures))}
                <span>°C</span>
              </div>
              <span className="hero-range">
                {temperatures.length
                  ? display(Math.min(...temperatures)) +
                    "–" +
                    display(Math.max(...temperatures)) +
                    "°C indoor range"
                  : "Waiting for indoor readings"}
              </span>
            </div>
            <div className="hero-climate-secondary">
              <div>
                <span className="metric-label">
                  <Droplets size={16} /> Humidity
                </span>
                <strong>
                  {display(mean(indoors.map((r) => r.latest!.humidity)), 0)}
                  <span>%</span>
                </strong>
              </div>
              <div className="hero-comfort">
                <Leaf size={18} />
                <div>
                  <strong>
                    {!indoors.length
                      ? "Ready to connect"
                      : needsAttention.length
                        ? "A little attention"
                        : "Feels just right"}
                  </strong>
                  <small>
                    {comfortable.length} of {indoors.length} indoor rooms
                    optimal
                  </small>
                </div>
              </div>
            </div>
          </div>
        )}
        {!roomsOnly && <WeatherWidget />}
      </section>
      <div className="section-heading rooms-heading">
        <div className="rooms-title">
          <h2>{roomsOnly ? "All spaces" : "Your rooms"}</h2>
          <span className="count-badge">{rooms.length}</span>
        </div>
        <div className="room-controls">
          {roomsOnly && (
            <label className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a room"
                aria-label="Find a room"
              />
            </label>
          )}
          <select
            aria-label="Filter rooms"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All rooms</option>
            <option value="online">Online rooms</option>
            <option value="attention">Needs attention</option>
          </select>
        </div>
      </div>
      <div className="rooms-grid">
        {filtered.map((room) => (
          <RoomCard key={room.id} room={room} now={now} />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <House size={30} />
          <h3>
            {rooms.length
              ? "No matching rooms"
              : "Your next reading starts here"}
          </h3>
          <p>
            {rooms.length
              ? "Try a different room name or filter."
              : "Connect a sensor to start seeing your home’s climate. Check your viewer access if you expected rooms here."}
          </p>
          <Link href="/?view=help">
            Getting started <ArrowRight size={16} />
          </Link>
        </div>
      )}
      {!roomsOnly && (
        <>
          <div className="comfort-banner">
            <span className="comfort-leaf">
              <Leaf size={22} />
            </span>
            <div>
              <strong>
                {needsAttention.length
                  ? needsAttention[0].room + " could use a closer look."
                  : indoors.length
                    ? "A little peace of mind."
                    : "Every reading tells a story."}
              </strong>
              <p>
                {needsAttention.length
                  ? "Its latest reading is outside the indoor comfort range."
                  : indoors.length
                    ? "Your online indoor rooms are within the comfort range."
                    : "Your home’s climate will appear as your sensors connect."}
              </p>
            </div>
            {needsAttention.length ? (
              <a href={"/room/?id=" + needsAttention[0].id}>
                View room <ArrowUpRight size={17} />
              </a>
            ) : (
              <ShieldCheck size={23} />
            )}
          </div>
          <div className="overview-bottom">
            <HistoryChart />
            <aside className="panel comfort-guide">
              <div className="guide-heading">
                <span className="room-icon tone-green">
                  <Leaf size={23} />
                </span>
                <span className="eyebrow">A LITTLE PERSPECTIVE</span>
              </div>
              <h2>Room to feel good.</h2>
              <p>A simple reference for a comfortable indoor climate.</p>
              <div className="guide-range">
                <Thermometer size={18} />
                <span>Temperature</span>
                <strong>19–23°C</strong>
              </div>
              <div className="comfort-scale">
                <span />
              </div>
              <div className="guide-range">
                <Droplets size={18} />
                <span>Humidity</span>
                <strong>40–60%</strong>
              </div>
              <div className="comfort-scale humidity-scale">
                <span />
              </div>
              <div className="guide-tip">
                <Sprout size={18} />
                <p>
                  Outdoor readings have their own context. Indoor comfort ranges
                  don’t apply outside.
                </p>
              </div>
              <Link href="/?view=help">
                Understanding your climate <ArrowUpRight size={16} />
              </Link>
            </aside>
          </div>
        </>
      )}
      <div className="last-sync">
        {refreshed
          ? "Last synced " +
            new Date(refreshed).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Waiting for readings"}
        <span>·</span>ESP32-C3 + SHT31
      </div>
    </>
  );
}
function Summary({
  label,
  icon,
  value,
  unit,
  note,
  tint,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  unit: string;
  note: string;
  tint: string;
}) {
  return (
    <div className="summary-card">
      <div className="summary-label">
        {label}
        <span className={`summary-icon ${tint}`}>{icon}</span>
      </div>
      <div className="summary-value">
        {value}
        <span>{unit}</span>
      </div>
      <p>{note}</p>
    </div>
  );
}
export function RoomDetail() {
  const { rooms, now } = useClimate();
  const id = useSearchParams().get("id");
  const room = rooms.find((r) => r.id === id);
  return (
    <AuthGate>
      <DataNotice />
      <Link className="back-link" href="/?view=rooms">
        <ArrowLeft size={15} />
        Back to rooms
      </Link>
      {room ? (
        <>
          <PageTitle
            eyebrow={
              isOutdoor(room.room)
                ? "A BREATH OF FRESH AIR"
                : "YOUR ROOM, UP CLOSE"
            }
            title={room.room}
            subtitle={`${room.name} · ESP32-C3 + SHT31`}
          >
            <span
              className={
                "detail-room-icon room-icon tone-" + roomTone(room.room)
              }
            >
              <RoomIcon name={room.room} size={32} />
            </span>
          </PageTitle>
          <div className="detail-summary">
            <Summary
              label="Current temperature"
              icon={<Thermometer size={18} />}
              value={display(room.latest?.temperature)}
              unit="°C"
              note={
                isOnline(room, now)
                  ? "Latest sensor reading"
                  : "Last known reading"
              }
              tint="peach"
            />
            <Summary
              label="Current humidity"
              icon={<Droplets size={18} />}
              value={display(room.latest?.humidity, 0)}
              unit="%"
              note={
                isOnline(room, now)
                  ? "Latest sensor reading"
                  : "Last known reading"
              }
              tint="blue"
            />
            <div className="summary-card">
              <div className="summary-label">
                Sensor status
                <StatusBadge room={room} now={now} />
              </div>
              <div className="reading-age">
                {room.latest
                  ? relativeTime(room.latest.created_at, now)
                  : "No readings yet"}
              </div>
              <p>
                {room.latest
                  ? (isOnline(room, now) ? "Online · " : "Last reading · ") +
                    new Date(room.latest.created_at).toLocaleString()
                  : "Waiting for your sensor"}
              </p>
            </div>
          </div>
          {!isOnline(room, now) && (
            <div className="alert-banner">
              <CircleAlert size={17} />
              This sensor is {statusOf(room, now)}. Check its power and Wi-Fi
              connection. Values shown are the last known readings.
            </div>
          )}
          <ClimateInsights room={room} now={now} /><HistoryChart deviceId={room.id} detail />
          <div className="info-note">
            <ShieldCheck size={18} />
            <span>
              {isOutdoor(room.room)
                ? "Outdoor humidity is shown for context; indoor comfort ranges do not apply. Dew point, absolute humidity, and ventilation guidance are not calculated."
                : "Default comfort range: 19–23°C and 40–60% humidity. Customize this room in Climate Insights. A sensor is marked offline after 10 minutes without a reading."}
            </span>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <House size={30} />
          <h1>Room not found</h1>
          <p>This room may have been removed, or you may not have access.</p>
          <Link href="/">Return to your home</Link>
        </div>
      )}
    </AuthGate>
  );
}
function Devices() {
  const { rooms, now } = useClimate();
  return (
    <>
      <PageTitle
        eyebrow="THE LITTLE THINGS, CONNECTED"
        title="Meet your sensors."
        subtitle="Connection health for every device around your home."
      />
      <div className="panel device-list">
        {rooms.map((room) => (
          <a key={room.id} className="device-row" href={`/room/?id=${room.id}`}>
            <span className="room-icon tint-1">
              <RoomIcon name={room.room} />
            </span>
            <div>
              <h3>{room.name}</h3>
              <p>{room.room} · ESP32-C3 + SHT31</p>
            </div>
            <StatusBadge room={room} now={now} />
            <ChevronRight size={17} />
          </a>
        ))}
        {!rooms.length && (
          <div className="empty-state">
            No devices found. Add a device in Supabase to get started.
          </div>
        )}
      </div>
      <div className="info-note">
        <Wifi size={18} />
        <span>
          Online means a reading was received less than 10 minutes ago. Devices
          are managed in your Supabase database.
        </span>
      </div>
    </>
  );
}
function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await getSupabase()!.auth.signInWithPassword({
        email,
        password,
      });
      if (result.error) throw result.error;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="sign-in-form panel" onSubmit={submit}>
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
        <ArrowRight size={16} />
      </button>
      <p>
        Use the household viewer account created by your Supabase administrator.
      </p>
    </form>
  );
}
function Settings() {
  const { demo, session } = useClimate();
  const [error, setError] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your home, your settings."
        subtitle="Manage your connection and understand your dashboard."
      />
      <div className="settings-grid">
        <div className="settings-shortcuts">
          <Link className="button" href="/?view=devices">
            <Wifi size={18} />
            Sensors
            <ChevronRight size={16} />
          </Link>
          <Link className="button" href="/?view=help">
            <House size={18} />
            Help & setup
            <ChevronRight size={16} />
          </Link>
        </div>
        <AtmosphereSettings />
        <section className="panel settings-panel">
          <div className="settings-icon">
            <Wifi size={22} />
          </div>
          <h2>Data connection</h2>
          <p>
            {demo
              ? "You’re currently exploring Atmos with sample readings. Your real sensors are just a connection away."
              : "Your dashboard is connected to Supabase. Readings refresh automatically every minute."}
          </p>
          <div className="setting-value">
            <span>Data source</span>
            <strong>{demo ? "Demo data" : "Supabase"}</strong>
          </div>
          <div className="setting-value">
            <span>Refresh interval</span>
            <strong>60 seconds</strong>
          </div>
          <div className="setting-value">
            <span>Offline threshold</span>
            <strong>10 minutes</strong>
          </div>
          {demo ? (
            <Link className="button primary" href="/?view=help">
              Connection guide
              <ArrowUpRight size={15} />
            </Link>
          ) : session ? (
            <>
              <p>Signed in as {session.user.email}</p>
              <button
                className="button"
                onClick={async () => {
                  const r = await getSupabase()!.auth.signOut();
                  if (r.error) setError(r.error.message);
                }}
              >
                Sign out
              </button>
              {error && <p role="alert">{error}</p>}
            </>
          ) : (
            <SignIn />
          )}
        </section>
        <section className="panel settings-panel">
          <div className="settings-icon">
            <Leaf size={22} />
          </div>
          <h2>Comfort preferences</h2>
          <p>
            Starting ranges are shown below. Customize each room in its Climate Insights section.
          </p>
          <div className="setting-value">
            <span>Temperature</span>
            <strong>19–23°C</strong>
          </div>
          <div className="setting-value">
            <span>Humidity</span>
            <strong>40–60%</strong>
          </div>
          <div className="setting-value">
            <span>Timezone</span>
            <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
          </div>
          <p className="small-note">
            These indicators are general comfort references. They aren’t safety
            alarms or medical advice.
          </p>
        </section>
      </div>
    </>
  );
}
function Help() {
  return (
    <>
      <PageTitle
        eyebrow="LET’S GET YOU SETTLED"
        title="A little help, a better home."
        subtitle="Everything you need to connect your first room."
      />
      <div className="panel help-panel">
        <h2>Connect Atmos to Supabase</h2>
        <ol className="setup-steps">
          <li>
            <span>1</span>
            <div>
              <h3>Create your database tables</h3>
              <p>
                Run the included <code>supabase/schema.sql</code> in a new
                Supabase project. Optionally run <code>supabase/seed.sql</code>{" "}
                to explore 30 days of sample readings.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>Connect the app</h3>
              <p>
                Copy <code>.env.example</code> to <code>.env.local</code>. Set
                your Supabase URL and publishable key, then rebuild the app.
                Never put a service role key in the browser.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>Invite your household viewer</h3>
              <p>
                Create an email/password user in Supabase Auth and grant the{" "}
                <code>climate_viewer</code> app metadata claim using the SQL in
                the README. Sign in to Atmos with that account.
              </p>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <h3>Send your first reading</h3>
              <p>
                Register each sensor in <code>devices</code>. Send temperature
                and humidity readings through your trusted ingestion service
                into <code>sensor_readings</code>. Use each device’s UUID and a
                UTC timestamp.
              </p>
            </div>
          </li>
        </ol>
      </div>
      <div className="settings-grid help-bottom">
        <section className="panel settings-panel">
          <h2>Understanding the status</h2>
          <p>
            <b>Comfortable:</b> 19–23°C and 40–60% humidity.
          </p>
          <p>
            <b>Needs attention:</b> temperature or humidity outside that range.
          </p>
          <p>
            <b>Offline:</b> no reading for 10 minutes or longer. The last known
            values remain visible.
          </p>
          <p>
            <b>Inactive:</b> the device has been disabled in Supabase.
          </p>
        </section>
        <section className="panel settings-panel">
          <h2>Take your home with you</h2>
          <p>
            Open Atmos in Chrome on Android and choose “Install Atmos” in the
            page footer, or “Add to Home screen” from the browser menu.
          </p>
          <p>
            The app needs HTTPS for installation. If your connection drops, an
            offline page will let you know; sensor readings always need a
            connection.
          </p>
          <p>
            Switch between light and dark mode using the moon or sun icon at the
            top.
          </p>
        </section>
      </div>
    </>
  );
}
