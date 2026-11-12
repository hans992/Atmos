import { assess, DEFAULT_COMFORT, fresh, type Comfort, type Sample } from "./intelligence";
import { isOutdoor } from "./room-presentation";
import type { Room } from "./types";

// Atmos currently ships English copy. Keep the locale contract explicit so a
// future translation catalog can extend both deterministic and AI-assisted UI.
export const INSIGHTS_LOCALE = "en" as const;
export const MIN_INTERVAL_MS = 10 * 60_000;
export const CACHE_TTL_MS = 60 * 60_000;
export type Choice = { insightId: string; variant: number };
export type Candidate = { id: string; priority: number; variants: string[] };
const round = (n: number | null | undefined) => n == null ? null : Math.round(n * 10) / 10;
const bucket = (n: number | null, size: number) => n == null ? null : Math.floor(n / size);
const familiarNames = /^(living room|bedroom|kitchen|home office|bathroom|nursery|hallway|dining room|basement|attic|garage)$/i;

export function summarizeHome(rooms: Room[], outdoor: Sample | null, preferences: Record<string, Comfort>, now: number) {
  const indoor = [...rooms].filter(r => !isOutdoor(r.room)).sort((a,b) => a.id.localeCompare(b.id));
  const observations = indoor.map((r, index) => {
    const p = preferences[r.id] ?? DEFAULT_COMFORT;
    const a = assess(r.latest, r.recent ?? [], outdoor, now, p, r.active);
    return {
      // Custom labels can contain personal names. Only standard room types leave Atmos.
      name: familiarNames.test(r.room) ? r.room : `Room ${index + 1}`,
      available: a.available,
      reading: r.latest ? { temperature: r.latest.temperature, humidity: r.latest.humidity, timestamp: r.latest.created_at } : null,
      absoluteHumidity: round(a.current?.absoluteHumidity), dewPoint: round(a.current?.dewPoint),
      risk: a.risk, recommendation: a.advice, limitation: a.reason,
      elevatedMinutes: Math.floor(a.elevatedMinutes), highMinutes: Math.floor(a.highMinutes),
      trend: { temperature: round(a.temperatureChange), humidity: round(a.humidityChange), moisture: round(a.moistureChange) },
      comfort: p,
    };
  });
  const available = observations.filter(r => r.available);
  const elevated = available.filter(r => r.reading!.humidity > r.comfort.elevatedHumidity);
  const cold = available.filter(r => r.reading!.temperature < r.comfort.minTemperature);
  const warm = available.filter(r => r.reading!.temperature > r.comfort.maxTemperature);
  const dry = available.filter(r => r.reading!.humidity < r.comfort.minHumidity);
  const sustained = available.filter(r => r.risk === "High Risk");
  const candidates: Candidate[] = [];
  const add = (id:string, priority:number, ...variants:string[]) => candidates.push({ id, priority, variants });
  if (sustained.length) add("sustained", 100,
    "Humidity has stayed high in part of your home. Check for moisture sources and review the affected rooms.",
    "Persistent humidity needs attention. Check affected rooms for moisture sources; air readings alone cannot confirm mold.");
  if (elevated.length) {
    const observation = `Humidity is elevated in ${elevated.length === 1 ? "one room" : `${elevated.length} rooms`}.`;
    const allVentilate = elevated.every(r => r.recommendation === "Ventilate Now");
    add("humidity", 80, `${observation} ${allVentilate ? "Drier outdoor air may help; reassess after ventilating." : "Check moisture sources and follow each room’s guidance."}`,
      `${observation} ${allVentilate ? "Consider ventilation, then check whether moisture decreases." : "Keep an eye on these rooms and address moisture sources."}`);
  }
  if (cold.length) add("cold", 60, `${cold.length === 1 ? "One room is" : `${cold.length} rooms are`} below your preferred temperature. Gentle heating can improve comfort; it does not remove moisture.`);
  if (available.some(r => r.risk === "Moderate Risk") && !elevated.length)
    add("condensation", 75, "Air readings suggest possible condensation on cool surfaces. Check affected rooms; surface temperatures are not measured.");
  if (warm.length) add("warm", 50, `${warm.length === 1 ? "One room is" : `${warm.length} rooms are`} warmer than your comfort range. Reduce heat sources where practical.`);
  if (dry.length) add("dry", 50, `${dry.length === 1 ? "One room has" : `${dry.length} rooms have`} dry air. Monitor humidity against your room preferences.`);
  if (available.some(r => (r.trend.humidity ?? 0) >= 5)) add("rising", 70, "Humidity is rising in part of your home. Check recent activities and moisture sources.");
  if (!candidates.length && available.length === observations.length && available.length && available.every(r => r.recommendation === "Climate Is Optimal"))
    add("comfortable", 10, "Indoor conditions are within your comfort ranges. No action is needed right now.", "Your rooms are comfortable. Keep your usual routine.");
  if (!candidates.length && available.length < observations.length)
    add("coverage", 5, available.length ? "Some rooms lack fresh readings. Home guidance covers only sensors reporting now." : "Fresh indoor readings are unavailable. Check your sensors to restore home guidance.");
  const highest = Math.max(...candidates.map(c => c.priority));
  const eligible = candidates.filter(c => c.priority === highest);
  const outside = fresh(outdoor, now, CACHE_TTL_MS) ? outdoor : null;
  const summary = {
    locale: INSIGHTS_LOCALE, rooms: observations,
    outdoor: outside ? { ...outside, source: "weather estimate", fresh: true } : { fresh: false },
    limitations: ["Air readings only; wall temperatures are not measured.", "Estimated mold risk is not confirmed mold.", "Heating does not remove moisture.", "Ventilation benefit is conditional; duration is not prescribed.", "Missing history cannot establish long-term safety."],
  };
  // Timestamp churn is not an environmental event. Threshold crossings, missing
  // sensors, substantial changes, trends and exposure durations are events.
  const fingerprint = JSON.stringify({ version: 1, locale: INSIGHTS_LOCALE, rooms: observations.map(r => ({
    name: r.name, available: r.available, risk: r.risk, advice: r.recommendation, comfort: r.comfort,
    t: bucket(r.reading?.temperature ?? null, 2), h: bucket(r.reading?.humidity ?? null, 5),
    duration: bucket(r.elevatedMinutes, 30), high: bucket(r.highMinutes, 30),
    trend: (r.trend.humidity ?? 0) >= 5 ? "rising" : (r.trend.moisture ?? 0) < -0.5 ? "drying" : "steady",
  })), outdoor: outside ? [bucket(outside.temperature, 2), bucket(outside.humidity, 10)] : null, candidates: eligible });
  return { summary, candidates: eligible, fingerprint };
}
export type HomeSummary = ReturnType<typeof summarizeHome>;

export function validateChoice(value: unknown, candidates: Candidate[]): Choice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "insightId,variant" || typeof v.insightId !== "string" || !Number.isInteger(v.variant)) return null;
  const c = candidates.find(c => c.id === v.insightId);
  return c && typeof v.variant === "number" && v.variant >= 0 && v.variant < c.variants.length ? { insightId: c.id, variant: v.variant } : null;
}
export function choiceText(choice: Choice, candidates: Candidate[]) {
  return candidates.find(c => c.id === choice.insightId)?.variants[choice.variant] ?? null;
}
export function fallbackChoice(home: HomeSummary): Choice | null {
  return home.candidates[0] ? { insightId: home.candidates[0].id, variant: 0 } : null;
}
