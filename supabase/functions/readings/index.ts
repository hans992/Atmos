import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { createHandler, type IngestResult } from "./handler.ts";

// Supabase injects these on the server. Never forward the device Authorization
// header to this client, and never expose this credential to a browser/device.
const backend = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(createHandler(async (args) => {
  const { data, error } = await backend.rpc("ingest_reading", args);
  if (error || !data) throw new Error("Ingestion failed");
  return data as IngestResult;
}));
