import type { Database } from "./database.types";
export type { Database } from "./database.types";
export type Device = Database["public"]["Tables"]["devices"]["Row"];
export type SensorReading =
  Database["public"]["Tables"]["sensor_readings"]["Row"];
export type Room = Device & { latest: SensorReading | null; recent?: SensorReading[] };
export type TimeRange = "24h" | "7d" | "30d";
export type ChartPoint =
  Database["public"]["Functions"]["climate_history"]["Returns"][number];
export type RoomStatus =
  | "comfortable"
  | "high-humidity"
  | "low-humidity"
  | "warm"
  | "cool"
  | "offline"
  | "inactive"
  | "waiting";
