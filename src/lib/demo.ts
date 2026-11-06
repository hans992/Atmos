import { RANGE_HOURS } from "./climate";
import type { Room, ChartPoint, TimeRange } from "./types";
const definitions = [
  ["Living room", 22.4, 46],
  ["Bedroom", 20.8, 51],
  ["Kitchen", 23.2, 48],
  ["Home office", 22.1, 43],
  ["Bathroom", 23.6, 68],
  ["Nursery", 21.0, 49],
] as const;
export function demoRooms(now: number): Room[] {
  return definitions.map(([room, temperature, humidity], i) => {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    return {
      id,
      name: `ESP32-C3-${String(i + 1).padStart(2, "0")}`,
      room,
      active: true,
      created_at: new Date(now - 40 * 86400000).toISOString(),
      latest: {
        ingest_request_id: null,
        id: i + 1,
        device_id: id,
        temperature,
        humidity,
        created_at: new Date(
          now - (i === 5 ? 7200000 : (i + 1) * 20000),
        ).toISOString(),
      },
    };
  });
}
export function demoHistory(
  range: TimeRange,
  deviceId: string | null,
  now: number,
): ChartPoint[] {
  const index = deviceId
    ? definitions.findIndex((_, i) =>
        deviceId.endsWith(String(i + 1).padStart(12, "0")),
      )
    : -1;
  if (deviceId && index < 0) return [];
  const baseT = index >= 0 ? definitions[index][1] : 22.4;
  const baseH = index >= 0 ? definitions[index][2] : 51.2;
  const hours = RANGE_HOURS[range];
  const step = range === "24h" ? 0.25 : range === "7d" ? 1 : 6;
  return Array.from({ length: hours / step + 1 }, (_, i) => {
    const age = hours - i * step;
    return {
      created_at: new Date(now - age * 3600000).toISOString(),
      temperature: +(
        baseT +
        Math.sin(age / 4 + index) * 0.9 +
        Math.sin(age * 1.7) * 0.12
      ).toFixed(2),
      humidity: +(
        baseH +
        Math.sin(age / 5 + 1) * 4 +
        Math.sin(age * 0.9) * 0.7
      ).toFixed(2),
      reading_count: 3,
    };
  }).filter((p) => index !== 5 || Date.parse(p.created_at) <= now - 7200000);
}
