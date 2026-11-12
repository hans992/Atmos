# Home Insights and optional Gemini

Atmos remains a static Next.js export. Its existing Supabase Edge Function architecture hosts the optional AI endpoint; there is no Next.js server or browser-side Gemini call.

## What appears in the app

Each room card contains one short deterministic recommendation. Open the room and expand **Climate details** for absolute humidity, dew point and estimated risk. **How this guidance works** contains methodology, limitations, trends and browser-local comfort preferences.

The dashboard shows one compact **Home Insights** observation above the room grid, replacing the duplicate attention banner. It prioritizes persistent humidity, elevated/rising humidity, temperature and dry air before comfort. Missing readings prevent an all-home comfort claim. An empty home has no insight. Existing glass surfaces, weather backgrounds and themes are retained.

## Enable AI (optional)

Without either feature flag or a Gemini key, the rule engine remains fully functional. Demo mode never calls Gemini.

1. Run `supabase/home-insights.sql` in the project's SQL editor. It creates only private cache and budget tables plus service-role-only RPCs. It does not alter sensor tables, grants or ingestion.
2. Run `npm ci` and `npm run build:insights`. This bundles shared TypeScript into the ignored `supabase/functions/home-insights/logic.js`; rebuild it after source changes and before every function deployment.
3. Deploy the **home-insights** function with its `index.ts`, generated `logic.js` and `deno.json`, using the Supabase dashboard or your installed CLI's documented functions deployment command. The checked-in function config uses explicit JWT validation inside the handler (`auth.getUser`), followed by the `app_metadata.climate_viewer` check. Do not remove these checks.
4. Set the following **Supabase Edge Function secrets**, never frontend variables:

   ```dotenv
   CLIMATE_AI_ENABLED=true
   GEMINI_API_KEY=<your-server-only-key>
   GEMINI_MODEL=gemini-2.5-flash-lite
   ATMOS_ALLOWED_ORIGIN=https://atmos-eta-two.vercel.app
   ```

   The Supabase runtime supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The service key only manages AI cache/budgets. Sensor queries use the authenticated caller's RLS-scoped client.

5. Set **Vercel/frontend** `NEXT_PUBLIC_CLIMATE_AI_ENABLED=true` and rebuild/redeploy the static application. Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` remain unchanged. Never use a `NEXT_PUBLIC_` prefix for Gemini credentials.
6. Sign in as a climate viewer. A successful analysis displays **AI-assisted** beside Home Insights. Missing configuration, rejected model output, quotas, authentication errors or outages retain the deterministic insight. The small refresh control obeys the same limits as automatic analysis.

To disable AI immediately, set server `CLIMATE_AI_ENABLED=false`. Disable the frontend flag and rebuild to remove optional requests as well. For localhost, point a separate test function's `ATMOS_ALLOWED_ORIGIN` at the exact local origin; do not open production CORS to all origins.

## Trust and privacy

The maintained official `@google/genai` SDK runs only in the Edge Function. Gemini receives one bounded, consolidated summary: standard room names (custom labels become `Room N`), latest readings and timestamps, calculated absolute humidity/dew point, observed trends/durations, outdoor temperature/humidity and freshness, deterministic recommendations and limitations. No device UUIDs, email, address, coordinates, user IDs or raw historical records go to Gemini. The server rereads sensor data under RLS and calculates all metrics itself.

Outdoor data is the caller's existing weather-provider snapshot, validated for range and age and explicitly treated as a weather estimate. It is not independently verified by this endpoint. It cannot change ingestion or measurements. At most 24 devices and 400 readings per device are processed, using at most the last six hours for analysis.

Gemini is deliberately a constrained advisory editor: it chooses an approved insight and friendly wording variant using strict JSON `{ "insightId": "…", "variant": 0 }`. Only highest-priority deterministic candidates are eligible. Extra fields, arbitrary prose, unknown IDs and invalid variant indices are rejected. Atmos renders its own approved text, fewer than 30 words and at most two sentences. This prevents prompt injection or fluent but unsupported health claims from reaching the UI. No claim of measured wall temperatures, confirmed mold, guaranteed ventilation benefit or optimal ventilation duration is allowed. Heating is distinguished from moisture removal.

The app currently has English copy rather than a translation framework. The shared insight catalog and explicit `en` locale follow that convention. Other locale values are rejected until their full approved wording catalog is implemented; Gemini cannot silently switch languages.

## Cache and cost controls

- One consolidated analysis per viewer/home snapshot, never per room.
- A fingerprint ignores timestamp churn but changes on availability, comfort preferences, rule changes, 2°C/5 percentage-point reading buckets, significant trends and 30-minute exposure increments. Outdoor freshness and substantial weather changes also invalidate it.
- Matching insights expire after one hour. Browser session cache avoids repeat navigation requests; private Postgres cache survives cold starts and separate browser sessions. Changed observations immediately show fresh deterministic guidance while regeneration is limited.
- Server-side minimum **10 minutes** between Gemini attempts per viewer, including model failures and manual refresh. A 30-second lease and atomic Postgres claims deduplicate across function instances; in-process requests share the same promise. The browser waits ten minutes after a successful endpoint response (including rule fallback). Transport/HTTP/invalid-response failures retry after **one minute**, with a 20-second client timeout; these retries cannot bypass the server's AI budgets.
- Maximum **24 attempts per viewer per UTC day**, **100 per project per UTC day**. Failed/invalid requests to Gemini consume an attempt. A missing or unavailable cache fails closed without invoking Gemini.
- Requests are bounded to 16 KiB, model output to 128 tokens/1 KiB, network timeout to eight seconds and one attempt (no automatic retry). Model input is bounded by the device/history caps; history itself is not sent.
- These are call/token safeguards, not a guaranteed currency ceiling. Set a provider-side quota/billing alert appropriate to the configured model. Changing the model does not invalidate existing cache until an event or expiry.

Private cache stores user UUID, a SHA-256 event fingerprint, approved choice, timestamps, lease and counters; never raw readings or model prose. There is at most one row per viewer and one global budget row. Delete the viewer's cache row when deleting their account. This app currently has a single shared household; future multi-household support must add a household identifier to cache scope and retain caller-scoped RLS.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build:insights` and `npm run build`. Tests cover strict output validation, priority consistency, privacy shaping, meaningful-change fingerprints, caching/expiry, fallback, disabled configuration, simultaneous requests, request bounds/auth guards, and real Postgres execution of grants, cooldowns, leases and daily budgets through PGlite. A provider key and deployed function are required for a real Gemini smoke test; unit tests use deterministic doubles and do not incur API usage.

References: [Google Gen AI SDK](https://ai.google.dev/gemini-api/docs/libraries), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Supabase function authentication](https://supabase.com/docs/guides/functions/auth).

## When there is no request in Network

`HomeInsights` is mounted only on the **Home** dashboard, not Rooms, History, Settings or room-detail pages. It automatically invokes the function on initial load after a real signed-in session, a successful first sensor load and a meaningful indoor observation are available. It does not require a new sensor event. Subsequent meaningful changes and cache expiry trigger analysis subject to cooldowns; the existing 15-second clock rechecks eligibility.

Expand **AI status** beneath the insight to see the compiled frontend flag, session state, last attempt, current gate and next eligible time. The small refresh button requests an analysis only when eligible. The global header refresh button refreshes sensor data; it does not bypass AI caching. Network/HTTP failures also produce a sanitized `[Atmos AI]` warning in the browser console, without credentials, room readings or user identifiers.

Possible skips: disabled build flag; signed-out/demo mode; offline state; sensor-fetch error; first readings not loaded; no indoor observation; pending shared request; matching AI cache; or request cooldown. Successful rule-based fallback responses also wait ten minutes. The browser's per-user `atmos-insights-v1:` sessionStorage entry survives reloads. Older entries containing only `attemptedAt` are treated as failed/interrupted calls and use the one-minute retry interval automatically; no cache deletion is required after upgrading.

`NEXT_PUBLIC_CLIMATE_AI_ENABLED` is directly referenced in the source and inlined during `next build`. Set the Vercel **Production** variable to the exact string `true`, then build/deploy that environment. Updating a variable without rebuilding cannot alter already-built JavaScript. The installed service worker does not cache dashboard HTML, application JS or Supabase requests.

The frontend does not pre-check `app_metadata.climate_viewer`. The Edge Function verifies it after invocation, and the existing sensor RLS also depends on it. A stale JWT without the claim can therefore indirectly leave the frontend without room data. If access was recently granted and rooms are missing, sign out and sign in again; never remove RLS or grant access through `user_metadata`.

In Firefox Network, enable capture **before** opening Home or reloading, select **All** requests, and filter by `home-insights`. A cached insight may correctly produce no request. A CORS failure can show only `OPTIONS` and prevent `POST`; the allowed origin must be the exact frontend origin without a trailing slash. Do not use a wildcard to work around it. A `401` means the session was rejected, a `403` means access/origin was denied, and a successful `source: rules` response means the endpoint ran but supplied deterministic fallback rather than AI wording.
