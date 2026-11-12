import { createInsightsHandler } from "./logic.js";

Deno.serve(createInsightsHandler({
  url: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  enabled: Deno.env.get("CLIMATE_AI_ENABLED") === "true",
  apiKey: Deno.env.get("GEMINI_API_KEY"),
  model: Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash-lite",
  allowedOrigin: Deno.env.get("ATMOS_ALLOWED_ORIGIN") || "https://atmos-eta-two.vercel.app",
}));
