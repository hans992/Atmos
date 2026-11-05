import { getSupabase } from "./supabase";
import type { Room, TimeRange } from "./types";
export async function fetchRooms(signal: AbortSignal): Promise<Room[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .order("created_at")
    .order("id")
    .abortSignal(signal);
  if (error) throw error;
  return Promise.all(
    data.map(async (device) => {
      const result = await supabase
        .from("sensor_readings")
        .select("*")
        .eq("device_id", device.id)
        .lte("created_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle();
      if (result.error) throw result.error;
      return { ...device, latest: result.data };
    }),
  );
}
export async function fetchHistory(
  range: TimeRange,
  id: string | null,
  signal: AbortSignal,
) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .rpc("climate_history", { p_device_id: id, p_window: range })
    .abortSignal(signal);
  if (error) throw error;
  return data;
}
