# Indoor Climate Intelligence

All calculations run on existing SHT31 readings; deterministic guidance requires no firmware changes or database migrations. Temperature and RH remain the primary measurements. Room cards show one compact recommendation. Advanced metrics are in the room detail page's closed **Climate details** section; methodology and diagnostics are in **How this guidance works**. Outdoor rooms are excluded from indoor risk guidance. A compact **Home Insights** summarizes the most relevant observation across the home. See [optional Gemini setup](home-insights-ai.md) for the separate, server-only advisory layer and its private cache schema.

## Formulas and units

With air temperature T in °C and RH in percent, use the Magnus approximation over liquid water:

- Saturation pressure: es = 6.112 × exp(17.62 T / (243.12 + T)), hPa.
- Vapor pressure: e = RH × es / 100, hPa.
- Absolute humidity: AH = 216.679 e / (273.15 + T), g/m³ (ideal gas relation).
- gamma = ln(RH/100) + 17.62 T/(243.12 + T).
- Dew point: Td = 243.12 gamma/(17.62 − gamma), °C.

Values are calculated at full precision and displayed to one decimal. RH=0 gives AH=0 and no finite dew point. Missing/non-numeric/non-finite inputs, RH outside 0–100, and temperatures outside −40–60°C are rejected for intelligence. Subzero dew point is over water, not frost point. These approximations target ordinary indoor air, not industrial conditions.

References: [Vaisala absolute humidity calculation](https://docs.vaisala.com/r/M211244EN-E/en-US/GUID-6454B70E-2FB0-437D-8D3E-0DA8A5AD35D2), [Vaisala WMO dew-point formulation](https://docs.vaisala.com/r/M213372EN-B/en-US/GUID-EBE2B115-3C98-4C8C-9F2D-A2FF1EFECFCC?contentId=E66Nbe17eoJu13inzSjgUA) (Magnus coefficients over water). Sensor accuracy and model approximations limit the precision of inferred values.

## History and risk estimates

The existing per-device latest-reading query returns at most 400 raw readings in descending order instead of one. No new polling timer, external weather call, elevated database permission, or aggregate-history RPC is added. Existing chart queries are unchanged. Analysis considers only the most recent six hours; at one sample/minute the cap covers that period. Faster sampling may shorten coverage. The UI states sample count and limits. Demo mode does not manufacture historical exposure.

Intervals count only when both samples exceed the threshold and are valid, with a gap within 1.5 times the observed lower-quartile cadence plus 15 seconds, capped at seven minutes (supporting five-minute firmware sleep plus normal network delay). This detects missing one-minute samples as well as gaps in five-minute telemetry. Missing/invalid intervals break continuity. Duration is an approximation between samples, not proof of continuous conditions. No exposure is extrapolated beyond the final reading. Duplicate timestamps cannot increase duration. Current readings at least ten minutes old, from the future, invalid or inactive suppress guidance.

- Low Risk: no currently detected elevated air condition; not proof of long-term safety.
- Moderate Risk: current RH above the elevated threshold, or air temperature within 4°C of its dew point.
- High Risk: a current observed spell above the high RH threshold for at least 120 minutes, or above the elevated threshold for 180 minutes with a dew-point margin at most 4°C. A single spike cannot trigger this level.

These are transparent product heuristics, not a validated mold-growth model. Wall temperature, insulation, moisture sources and long-term exposure are unknown. Dew point identifies a possible condensation temperature, not measured wall condensation. Transitions from below to above the threshold are counted only across contiguous samples. Trends use the last continuous hour with at least 15 minutes of observations. Pearson temperature/RH correlation requires four samples and nonzero variance. A decrease over 0.5 g/m³ is described as drying consistent with ventilation, without assigning a cause.

## Recommendations and preferences

Fresh outdoor conditions come from the existing weather provider. Both its stale flag and measurement timestamp are checked (less than 60 minutes old, never future). Ventilation requires elevated indoor RH and outdoor vapor content at least 1 g/m³ lower when evaluated at indoor temperature. Normalizing outdoor AH for thermal expansion avoids comparing differently sized air volumes; equivalent to comparing vapor pressure at approximately equal atmospheric pressure. Actual flow, weather hazards, outdoor pollution and building-specific ventilation requirements are not modeled.

For cold rooms with elevated RH, heating guidance explicitly states that heating lowers RH without removing water. Conditions within the configured comfort range are optimal unless recent RH rose by at least five percentage points. Cold rooms without elevated RH receive gentle heating guidance; warm rooms receive heat-source reduction guidance; dry rooms receive dry-air monitoring guidance. Elevated or rising humidity keeps priority over these comfort suggestions. Missing outdoor data never produces a confident ventilation recommendation.

Defaults: 19–23°C, 40–60% RH, elevated above 60%, high above 70%. Room preferences live in `atmos-comfort-v1` localStorage keyed by device UUID, apply to badges and insights, and do not sync across browsers. Settings are edited in each room's expanded insights. Validation requires 5 ≤ Tmin < Tmax ≤ 35 and 0 ≤ RHmin < RHmax ≤ elevated < high ≤ 100. Local storage failure leaves session preferences usable and reports that they were not persisted. UI remains English, matching Atmos; climate calculations are isolated from React for future localization.

## Verification

`npm test` covers reference calculations, dry/saturated/invalid inputs, stale sensors and weather, gaps, isolated spikes, sustained exposure, preferences, drying and recommendation decisions. `npm run typecheck` and `npm run build` validate the Next.js integration. Raw data schema and read permissions are unchanged.
