# Atmos — home climate

A responsive home climate dashboard built with **Next.js App Router, TypeScript, Tailwind CSS, Recharts, and Supabase**. Includes Light/Dark/System modes, weather-reactive garden and glass surfaces, room cards, per-device room pages, 24-hour / 7-day / 30-day temperature and humidity charts, CSV export, sensor health, and Android PWA assets.

## Weather & appearance

Open **Settings → Appearance & Atmosphere** to change the theme, dynamic background, animation intensity, weather synchronization and garden/minimal background. The owner-selected default is **Duisburg–Rheinhausen** (district centre, not a street address). Change it with city search, coordinates, or optional browser location detection. Removing the location disables weather requests until another location is selected.

Weather comes from [Open-Meteo](https://open-meteo.com/) independently of sensor readings. No weather API key, new environment variable, Supabase migration or server runtime is required for this personal home dashboard. The static app calls the public forecast/geocoding APIs directly. See [weather architecture and settings](docs/WEATHER.md) for caching, privacy, fallbacks, performance and limitations.

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

`sensor_readings`: `id bigint identity`, `device_id uuid`, `temperature numeric(5,2)`, `humidity numeric(5,2)`, `created_at timestamptz`, `ingest_request_id uuid` (nullable).

Timestamps use timezone-aware UTC storage. The ingestion server assigns receipt time. `(device_id, ingest_request_id)` deduplicates retried hardware uploads. The existing database temperature constraint is -40 to 125°C; the ingestion API applies a narrower -40 to 85°C range. Humidity must be 0 to 100%.

The **secure `readings` Supabase Edge Function** authenticates each device using a unique random bearer key, validates the payload, and inserts into the existing table. Only SHA-256 key hashes are stored in a private credential table; viewers remain read-only. See [ESP32 setup and flashing instructions](docs/ESP32-SETUP.md) for the deployed endpoint, per-device configuration, testing and five-minute deep sleep. The payload is:

```json
{
  "device_id": "YOUR_REGISTERED_DEVICE_UUID",
  "temperature": 22.4,
  "humidity": 46.0
}
```

The dashboard polls every 60 seconds and refreshes on reconnect/foreground. Cards and open charts show new readings without rebuilding. A sensor is offline at 10 minutes without readings; inactive and never-seen sensors are separate states. The current home averages exclude stale/inactive/no-data sensors. Room cards show last-known values for stale devices, clearly marked. Default comfort indicators use 18–26°C and 30–60% RH and are general UI references, not alarms.

History is averaged in PostgreSQL by the `climate_history` security-invoker RPC (15-minute / hourly / 6-hour buckets). This avoids Supabase's default REST row limit for dense month-long histories. Home history includes active devices' samples in each bucket; averages are sample-weighted. Current sensor values are queried independently using the `(device_id, created_at desc, id desc)` index. Empty intervals have no points; the chart visually connects the available samples and does not imply readings were taken in between.

## Structure

- `src/app/`: App Router dashboard, room route, styles, metadata, manifest.
- `src/components/`: shared shell, room cards, chart and time filters, state provider, PWA install control.
- `src/lib/database.types.ts`: database types generated from the connected SmartHome Supabase project.
- `src/lib/types.ts`: shared domain aliases and status/range types.
- `src/lib/supabase.ts`: typed, singleton publishable-key client.
- `src/lib/data.ts`: latest-reading queries and bounded history RPC.
- `src/lib/demo.ts`: sample home and chart data.
- `supabase/`: schema, optional seed, ingestion upgrade SQL, and TypeScript Edge Function.
- `firmware/`: Arduino/PlatformIO ESP32-C3 + SHT31 example (60-second test / five-minute deep sleep).
- `docs/ESP32-SETUP.md`: hardware, keys, HTTPS API, flashing, troubleshooting and rotation.
- `scripts/create-device-key.mjs`: offline administrator key-generation helper.
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

Ingestion tests also exercise HTTP input limits, key hashing, device binding, inactive/revoked credentials, numeric validation, idempotent retries, conflicting retry IDs, rate limits, and the exact 10-minute offline boundary. The SmartHome endpoint was tested over HTTPS with a controlled reading, wrong keys, a mismatched device, invalid payloads, deduplication, and concurrent rate-limited requests. Physical sensor measurements and sleep current require your board.

Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports), [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps).
