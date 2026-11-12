import { DEFAULT_COMFORT, type Comfort } from "./intelligence";
import type { Room, RoomStatus, TimeRange } from "./types";
export const RANGE_HOURS: Record<TimeRange, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
};
export const STATUS_LABELS: Record<RoomStatus, string> = {
  comfortable: "Comfortable",
  "high-humidity": "High humidity",
  "low-humidity": "Low humidity",
  warm: "Warm",
  cool: "Cool",
  offline: "Offline",
  inactive: "Inactive",
  waiting: "No readings",
};
export const STALE_AFTER_MS = 10 * 60 * 1000;
export function statusOf(room: Room, now = Date.now(), preferences: Comfort = DEFAULT_COMFORT): RoomStatus {
  if (!room.active) return "inactive";
  if (!room.latest) return "waiting";
  if (!Number.isFinite(Date.parse(room.latest.created_at)) || now < Date.parse(room.latest.created_at) || now - Date.parse(room.latest.created_at) >= STALE_AFTER_MS)
    return "offline";
  if (room.latest.humidity > preferences.maxHumidity) return "high-humidity";
  if (room.latest.humidity < preferences.minHumidity) return "low-humidity";
  if (room.latest.temperature > preferences.maxTemperature) return "warm";
  if (room.latest.temperature < preferences.minTemperature) return "cool";
  return "comfortable";
}
export function isOnline(room: Room, now = Date.now()) {
  return !["offline", "inactive", "waiting"].includes(statusOf(room, now));
}
export function relativeTime(timestamp: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
export function mean(values: number[]) {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}
export function display(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : value.toFixed(digits);
}
