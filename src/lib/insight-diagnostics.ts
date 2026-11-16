// Fixed, non-sensitive codes shared by the Edge Function and status disclosure.
export const FALLBACK_MESSAGES = {
  ai_disabled: "AI is disabled in the Edge Function configuration.",
  api_key_missing: "The Edge Function has no Gemini API key configured.",
  no_insight: "There is no eligible indoor observation to analyze.",
  cache_read_failed: "The AI cache could not reserve an analysis. No Gemini request was made.",
  cache_invalid: "The stored AI choice failed validation; current rules are shown.",
  analysis_in_progress: "Another home analysis is already in progress.",
  cooldown: "The server's ten-minute analysis cooldown is active.",
  user_daily_budget: "This viewer's daily AI request limit has been reached.",
  project_daily_budget: "The project's daily AI request limit has been reached.",
  cache_not_reserved: "The server did not grant an analysis reservation.",
  provider_error: "Gemini returned an API error.",
  provider_auth_error: "Gemini rejected the configured API credentials or permissions.",
  provider_rate_limited: "Gemini's provider quota or rate limit was reached.",
  provider_timeout: "The Gemini request timed out.",
  provider_truncated: "Gemini reached its output limit before completing the response.",
  provider_blocked: "Gemini blocked the response.",
  provider_incomplete: "Gemini did not finish a complete response.",
  response_empty: "Gemini returned no structured response.",
  response_too_large: "Gemini's response exceeded the permitted size.",
  response_invalid_json: "Gemini's response was not valid JSON.",
  response_invalid_shape: "Gemini's response was not the required object.",
  response_unexpected_fields: "Gemini returned missing or unexpected fields.",
  response_unknown_insight: "Gemini selected an insight outside the approved set.",
  response_invalid_variant: "Gemini's wording variant was not an integer.",
  response_variant_out_of_range: "Gemini's wording variant was outside the selected insight's range.",
  cache_write_failed: "A valid AI response could not be saved to the cache.",
  cache_lease_expired: "The analysis reservation expired before the result was saved.",
} as const;
export type FallbackReason = keyof typeof FALLBACK_MESSAGES;
export function isFallbackReason(value: unknown): value is FallbackReason {
  return typeof value === "string" && Object.hasOwn(FALLBACK_MESSAGES, value);
}
