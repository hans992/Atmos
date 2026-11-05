import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
let client: SupabaseClient<Database> | null = null;
export function getSupabase() {
  if (!url || !key) return null;
  if (!client) client = createClient<Database>(url, key);
  return client;
}
