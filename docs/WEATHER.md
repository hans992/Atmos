# Weather & atmosphere

## Setup and controls

The initial home weather location is Duisburg–Rheinhausen, explicitly selected by the owner. Coordinates `51.401, 6.712` represent the district centre, verified through Open-Meteo's GeoNames search. They are not a precise home address. The initial timezone is `Europe/Berlin`.

Settings → Appearance & Atmosphere provides:

- Light, Dark and System themes. The existing `atmos-theme` preference is preserved; System also reacts to operating-system changes.
- Dynamic background Enabled/Disabled. Disabled restores the original clean gradient surfaces and layout.
- Animation Off/Subtle/Standard. Off pauses all environmental animation.
- Live weather/Static atmosphere. Static uses a neutral garden or gradient; the real weather widget continues refreshing.
- Nature / Garden or Minimal gradient.
- City/postal-code search, manual coordinates and optional permission-based browser location. Search results require selection; no location is silently detected. Removing the location stops subsequent forecast requests.

Preferences live in this browser's `atmos-appearance-v1` localStorage entry. They do not synchronize across devices. Only the location name, rounded coordinates (three decimal places) and timezone are retained. The forecast request sends coordinates/timezone to Open-Meteo; city searches go to its geocoding API. No sensor values or Supabase credentials accompany these requests. The browser sends no credentials or referrer to the weather APIs. Private/storage-disabled browsing falls back to in-memory preferences/cache.

## Architecture

- `src/lib/weather.ts`: typed weather model, WMO normalization, defensive response parsing, API adapter, request deduplication and bounded cache.
- `src/lib/appearance.ts`: typed preferences, validation and the owner-configured district location.
- `src/components/appearance-provider.tsx`: persisted preferences, theme resolution and cross-tab preference updates.
- `src/components/weather-provider.tsx`: weather lifecycle independent of `ClimateProvider`. Sensor polling and manual sensor refresh do not re-fetch weather.
- `src/components/weather-atmosphere.tsx`: layered environmental scene with deterministic CSS droplets/snow. No random values during render, no animation framework, Canvas or continuous JavaScript frame loop.
- `src/components/weather-widget.tsx`: current weather, feels-like, humidity, wind, today's range, next six hours and expandable three-day outlook, sunrise/sunset and precipitation.
- `src/components/atmosphere-settings.tsx`: accessible native controls and location configuration.
- `src/app/atmosphere.css`: shared glass tokens, weather/time lighting and responsive styles, layered over the existing design.
- `public/atmosphere/`: locally served WebP garden assets; no runtime image hotlinks.

The Next.js static-export architecture remains intact. Public, keyless weather does not need a server proxy for this personal use case. The [free Open-Meteo API](https://open-meteo.com/en/pricing) is intended for non-commercial use and has usage limits. A commercial or larger deployment should use a suitable licensed plan and a server-side boundary for any private API key. Attribution is visible in the widget. Geocoding is based on GeoNames via Open-Meteo.

Weather values never enter `devices`, `sensor_readings`, the climate context or sensor charts. Indoor summaries still exclude stale sensors and outdoor sensor rooms. Outdoor relative humidity is displayed as outdoor weather, not interpreted as an indoor comfort score or ventilation recommendation.

## Freshness, time and failure behavior

The API explicitly requests Celsius, km/h, mm and Unix seconds. Intl formatting uses the returned IANA timezone, including DST. Sunrise/sunset determine the day's lighting; dawn/dusk use a modest 35-minute visual transition window around the reported events, not a separate astronomical twilight calculation. Polar locations with missing sunrise/sunset fall back to the API's day/night indicator. Unknown codes use a neutral atmosphere.

Requests time out after 12 seconds. A shared in-flight promise deduplicates requests; current data is reused for 20 minutes. Weather refreshes every 20 minutes while visible, and on reconnect or returning to the tab. The last response is optionally stored in `atmos-weather-cache-v1`; in-memory caching works without browser storage.

Data is marked stale after 30 minutes since fetch or 45 minutes since the reported current observation. A valid cached response can remain visible for up to six hours, explicitly labeled as saved/outdated; it never drives a live-looking weather effect while stale. Expired, malformed and implausibly future-dated responses are not displayed. Unconfigured locations, errors and offline states have explicit fallbacks; the sensor dashboard stays usable. The service worker remains unchanged and does not cache weather API traffic.

## Performance and accessibility

The environment is behind the dashboard with `pointer-events: none` and `aria-hidden`. Only opacity/transforms animate; lighting filters transition when weather changes. Rain slides over the decorative window plane, behind the glass cards. Snow appears only for snow/mixed precipitation. Inactive weather effects, hidden tabs and animation-Off mode pause animation. `prefers-reduced-motion` disables environmental animations/transitions. The maximum is 42 droplets and 24 snowflakes; subtle/mobile modes reduce density. Mobile uses an approximately 81 KB image versus approximately 266 KB for desktop. CSS backdrop-filter has an opaque surface fallback.

No thunderstorm flashes are used. The backdrop is an illustrative generated garden, not a live camera or an actual image of the home. Weather is forecast/model data and may differ from conditions at a particular window. Sensor measurements remain the only source of indoor readings.

## Validation

Run `npm test`, `npm run typecheck` and `npm run build`. The repository has no standalone ESLint configuration/script. Weather tests cover WMO codes, unknown/mixed conditions, invalid/missing values, timezone/DST behavior, dawn/day/dusk/night, missing solar events, cache expiry, deduplication, location isolation and invalid preferences. Existing schema/RLS, ingestion and offline-boundary tests remain intact.

References: [forecast API](https://open-meteo.com/en/docs), [geocoding API](https://open-meteo.com/en/docs/geocoding-api), [Next.js static export](https://nextjs.org/docs/app/guides/static-exports).
