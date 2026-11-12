import type { SensorReading } from "./types";
export type Sample = Pick<SensorReading, "temperature" | "humidity" | "created_at">;
export const DEFAULT_COMFORT = { minTemperature: 19, maxTemperature: 23, minHumidity: 40, maxHumidity: 60, elevatedHumidity: 60, highHumidity: 70 };
export type Comfort = typeof DEFAULT_COMFORT;
export function validComfort(p: Comfort): boolean {
  return Object.values(p).every(Number.isFinite) && p.minTemperature >= 5 && p.maxTemperature <= 35 && p.minTemperature < p.maxTemperature && p.minHumidity >= 0 && p.minHumidity < p.maxHumidity && p.maxHumidity <= p.elevatedHumidity && p.elevatedHumidity < p.highHumidity && p.highHumidity <= 100;
}
export function metrics(temperature: unknown, humidity: unknown) {
  if (typeof temperature !== "number" || typeof humidity !== "number" || !Number.isFinite(temperature) || !Number.isFinite(humidity) || temperature < -40 || temperature > 60 || humidity < 0 || humidity > 100) return null;
  const vaporPressure = humidity / 100 * 6.112 * Math.exp(17.62 * temperature / (243.12 + temperature));
  const gamma = humidity > 0 ? Math.log(humidity / 100) + 17.62 * temperature / (243.12 + temperature) : null;
  return { absoluteHumidity: 216.679 * vaporPressure / (temperature + 273.15), dewPoint: gamma === null ? null : 243.12 * gamma / (17.62 - gamma), vaporPressure };
}
export function fresh(sample: Sample | null, now: number, age = 10 * 60_000): sample is Sample {
  if (!sample || !metrics(sample.temperature, sample.humidity)) return false;
  const elapsed = now - Date.parse(sample.created_at);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < age;
}
export function assess(latest: Sample | null, history: readonly Sample[], outdoor: Sample | null, now: number, preferences: Comfort = DEFAULT_COMFORT, active = true) {
  const p = validComfort(preferences) ? preferences : DEFAULT_COMFORT;
  const current = latest ? metrics(latest.temperature, latest.humidity) : null;
  const available = active && fresh(latest, now);
  // Invalid samples break continuity; duplicate timestamps cannot add duration.
  const points = [...new Map([...history, ...(latest ? [latest] : [])].map(s => [Date.parse(s.created_at), s])).entries()]
    .filter(([t]) => Number.isFinite(t) && t <= now && t >= now - 6 * 3600_000).sort((a,b) => a[0]-b[0]);
  let elevatedMinutes = 0, highMinutes = 0, episodes = 0;
  // Infer cadence conservatively: a missing one-minute reading must break a
  // one-minute series even though five-minute deep-sleep sensors are supported.
  const intervals = points.slice(1).map(([t],i)=>t-points[i][0]).filter(dt=>dt>0 && dt<=7*60_000).sort((a,b)=>a-b);
  const cadence = intervals[Math.floor(intervals.length/4)] ?? 5*60_000;
  const gapLimit = Math.min(7*60_000, cadence*1.5+15_000);
  let run: Sample[] = [];
  for (let i=0; i<points.length; i++) {
    const [t,s] = points[i]; const previous = points[i-1];
    const contiguous = previous && t - previous[0] <= gapLimit && metrics(previous[1].temperature, previous[1].humidity);
    if (!metrics(s.temperature,s.humidity)) { elevatedMinutes=0; highMinutes=0; run=[]; continue; }
    if (!contiguous) { elevatedMinutes=0; highMinutes=0; run=[]; }
    const minutes = contiguous ? (t-previous[0])/60_000 : 0;
    if (s.humidity > p.elevatedHumidity) {
      if (contiguous && previous[1].humidity <= p.elevatedHumidity) episodes++;
      elevatedMinutes = contiguous && previous[1].humidity > p.elevatedHumidity ? elevatedMinutes+minutes : 0;
    } else elevatedMinutes=0;
    highMinutes = s.humidity > p.highHumidity && contiguous && previous[1].humidity > p.highHumidity ? highMinutes+minutes : 0;
    run.push(s);
  }
  const recent = run.filter(s => Date.parse(s.created_at) >= now-60*60_000);
  const first = recent[0]; const last = recent.at(-1);
  const enough = first && last && Date.parse(last.created_at)-Date.parse(first.created_at) >= 15*60_000;
  const humidityChange = enough ? last.humidity-first.humidity : null;
  const temperatureChange = enough ? last.temperature-first.temperature : null;
  const moistureChange = enough ? metrics(last.temperature,last.humidity)!.absoluteHumidity-metrics(first.temperature,first.humidity)!.absoluteHumidity : null;
  let correlation: number | null = null;
  if (enough && recent.length >= 4) {
    const mt=recent.reduce((a,s)=>a+s.temperature,0)/recent.length, mh=recent.reduce((a,s)=>a+s.humidity,0)/recent.length;
    const tt=recent.reduce((a,s)=>a+(s.temperature-mt)**2,0), hh=recent.reduce((a,s)=>a+(s.humidity-mh)**2,0);
    if (tt>0 && hh>0) correlation=recent.reduce((a,s)=>a+(s.temperature-mt)*(s.humidity-mh),0)/Math.sqrt(tt*hh);
  }
  const condensationMargin = current?.dewPoint == null || !latest ? null : latest.temperature-current.dewPoint;
  const risk = !available ? null : highMinutes >= 120 || (elevatedMinutes >= 180 && condensationMargin !== null && condensationMargin <= 4) ? "High Risk" : latest.humidity > p.elevatedHumidity || (condensationMargin !== null && condensationMargin <= 4) ? "Moderate Risk" : "Low Risk";
  const outside = fresh(outdoor,now,60*60_000) ? metrics(outdoor.temperature,outdoor.humidity) : null;
  // Normalize outdoor air to indoor temperature before comparing water per volume.
  const outdoorEquivalent = outside && latest ? 216.679*outside.vaporPressure/(latest.temperature+273.15) : null;
  let advice = "Monitor Humidity", reason = "Keep monitoring conditions against your room preferences.";
  if (!available) { advice="Awaiting fresh readings"; reason="Guidance is unavailable for inactive, invalid or stale readings."; }
  else if (latest.humidity > p.elevatedHumidity && outside && current && outdoorEquivalent !== null && current.absoluteHumidity-outdoorEquivalent >= 1) { advice="Ventilate Now"; reason="Outdoor air contains less water vapor at the indoor temperature. Brief ventilation is likely to reduce moisture; reassess afterwards."; }
  else if (latest.temperature < p.minTemperature && latest.humidity > p.elevatedHumidity) { advice="Heating Recommended"; reason="Gentle heating lowers relative humidity but does not remove water vapor. Address moisture sources as well."; }
  else if (latest.temperature >= p.minTemperature && latest.temperature <= p.maxTemperature && latest.humidity >= p.minHumidity && latest.humidity <= p.maxHumidity && (humidityChange === null || humidityChange < 5)) { advice="Climate Is Optimal"; reason="Air measurements are within your configured comfort range."; }
  else if (humidityChange !== null && humidityChange >= 5) reason="Humidity has risen by at least 5 percentage points in the recent observed period.";
  else if (latest.humidity <= p.elevatedHumidity && latest.temperature < p.minTemperature) { advice="Heating Recommended"; reason="Gentle heating may improve comfort. Heating does not remove moisture; keep monitoring humidity."; }
  else if (latest.humidity <= p.elevatedHumidity && latest.temperature > p.maxTemperature) { advice="Reduce Heat Sources"; reason="The room is warmer than your preferred range. Reduce heat sources where practical and monitor conditions."; }
  else if (latest.humidity < p.minHumidity) { advice="Monitor Dry Air"; reason="Humidity is below your preferred range. Monitor the room and review your comfort preferences."; }
  else if (!outside) reason="Fresh outdoor temperature and humidity are unavailable; ventilation benefit cannot be determined.";
  else if (latest.humidity > p.elevatedHumidity) reason="Outdoor air is not sufficiently drier to recommend ventilation for moisture removal.";
  return { current, available, risk, advice, reason, elevatedMinutes, highMinutes, episodes, humidityChange, temperatureChange, moistureChange, correlation, condensationMargin, outdoor: outside, samples: points.length };
}
