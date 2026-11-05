# Atmos — home climate

A responsive home climate dashboard built with **Next.js App Router, TypeScript, Tailwind CSS, Recharts, and Supabase**. Includes light/dark mode, room cards, per-device room pages, 24-hour / 7-day / 30-day temperature and humidity charts, CSV export, sensor health, and Android PWA assets.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. With no Supabase environment variables, the app uses clearly labeled, deterministic demo readings for six rooms. No cloud credentials are needed for the demo. Demo samples refresh every minute; they are simulated and not persisted.

## Connect Supabase

1. Run `supabase/schema.sql` once in a new Supabase project's SQL Editor. This is a standalone setup script, not a CLI migration. It creates the requested tables, constraints, indexes, RLS policies, and an aggregate history function.
2. Optionally run `supabase/seed.sql` to insert six devices and 30 days of hourly sample data. Five devices receive one fresh sample; the nursery intentionally shows a stale sensor. Seed data is static after insertion and naturally becomes stale unless your sensors send more readings. Only use the seed in a test database.
3. Copy `.env.example` to `.env.local` and set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

4. Create an email/password viewer in Supabase Authentication. This app is designed for **one private household per Supabase project**. Only users with an administrator-assigned `climate_viewer` app metadata claim can read the household's data. Use the SQL Editor as an administrator, replacing the email:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"climate_viewer": true}'::jsonb
where email = 'YOUR_VIEWER_EMAIL';
```

5. Restart development or rebuild for deployment, then sign in. Sign out/in after changing claims so the JWT is refreshed. Revoking this claim takes effect when existing JWTs expire or refresh; use a suitably short JWT lifetime if you need prompt revocation.

Environment variables are embedded at build time because this app uses Next.js static export. Rebuild after changing them. Never use a service-role or secret key in a `NEXT_PUBLIC_` variable or on an ESP32.

## Sensor data

Each `devices` row represents one ESP32-C3 with an SHT31 sensor and a room label. Each card/detail page refers to one device UUID. Multiple devices may share a room label and will appear as separate cards.

`devices`: `id uuid`, `name text`, `room text`, `active boolean`, `created_at timestamptz`.

`sensor_readings`: `id bigint identity`, `device_id uuid`, `temperature numeric(5,2)`, `humidity numeric(5,2)`, `created_at timestamptz`.

Timestamps use timezone-aware UTC storage. `(device_id, created_at)` is unique for retry deduplication. Temperature is validated from -40 to 125°C; humidity from 0 to 100%. The timestamp should reflect acquisition time and the sensor clock should be synchronized. Future readings are not displayed until their timestamp is reached.

Send device readings through your **trusted ingestion service**, which authenticates each device, validates its payload, and writes using server-only credentials. The dashboard deliberately grants browser viewers read-only access. This project does not include ESP32 firmware or an internet-facing ingestion endpoint. A typical validated ingestion payload is:

```json
{
  "device_id": "YOUR_REGISTERED_DEVICE_UUID",
  "temperature": 22.4,
  "humidity": 46.0,
  "created_at": "2026-11-05T12:00:00Z"
}
```

The dashboard polls every 60 seconds. A sensor is offline after 15 minutes without readings; inactive and never-seen sensors are separate states. The current home averages exclude stale/inactive/no-data sensors. Room cards show last-known values for stale devices, clearly marked. Default comfort indicators use 18–26°C and 30–60% RH and are general UI references, not alarms.

History is averaged in PostgreSQL by the `climate_history` security-invoker RPC (15-minute / hourly / 6-hour buckets). This avoids Supabase's default REST row limit for dense month-long histories. Home history includes active devices' samples in each bucket; averages are sample-weighted. Current sensor values are queried independently using the `(device_id, created_at desc, id desc)` index. Empty intervals have no points; the chart visually connects the available samples and does not imply readings were taken in between.

## Structure

- `src/app/`: App Router dashboard, room route, styles, metadata, manifest.
- `src/components/`: shared shell, room cards, chart and time filters, state provider, PWA install control.
- `src/lib/database.types.ts`: database types generated from the connected SmartHome Supabase project.
- `src/lib/types.ts`: shared domain aliases and status/range types.
- `src/lib/supabase.ts`: typed, singleton publishable-key client.
- `src/lib/data.ts`: latest-reading queries and bounded history RPC.
- `src/lib/demo.ts`: sample home and chart data.
- `supabase/`: schema and optional seed SQL.
- `src/service-worker.ts`: TypeScript service worker, compiled during build.
- `scripts/build-worker.ts`: builds the worker and generates app icons.
- `tests/`: domain checks and executable local PostgreSQL schema/RLS/aggregation checks.

Room URLs use `/room/?id=<uuid>` so any device can have a detail page without rebuilding static routes.
Room links use normal document navigation so they work on static hosts without Next.js segment-prefetch rewrite rules. Authentication persists through Supabase's client session storage.

## Build, check, and install

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` emits `out/`, deployable to an HTTPS static host. Static hosts must serve directory `index.html` files (including `/room/index.html`); no SPA rewrite is required. For local production verification, `npm run preview` serves the exported build on port 3000. The Next dev server does not register the service worker.

The PWA includes a manifest, 192/512px icons, a separate maskable icon, an installation prompt when the browser allows one, and an offline fallback page. Android Chrome requires HTTPS (localhost is permitted for development). Browser install eligibility may depend on browser usage and host authentication. If a private hosted preview is not installable, deploy `out/` to your own HTTPS origin.

The service worker caches only the offline fallback and app icons. It **does not cache dashboard HTML, sensor data, API responses, or authentication**. An already-open app retains readings in memory and flags network loss. Reopening while offline displays a reconnect page, not current-looking cached sensor values.

## Verification

`npm test` runs the SQL against PGlite's actual PostgreSQL runtime with local Supabase-role/auth stubs. It verifies schema creation, sample readings, numeric/FK constraints, denial of anonymous/unauthorized reads, authorized reads, denial of viewer writes, rejection of user-editable metadata authorization, and full 30-day aggregation. These checks do not substitute for testing against your chosen hosted Supabase project.

Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports), [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps).
