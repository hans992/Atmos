export type IngestArguments = {
  p_device_id: string;
  p_key_hash: string;
  p_temperature: number;
  p_humidity: number;
  p_request_id: string;
};
export type IngestResult = {
  status: number;
  error?: string;
  retry_after?: number;
  id?: string;
  created_at?: string;
  duplicate?: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 1024;
function json(status: number, value: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
export function createHandler(ingest: (args: IngestArguments) => Promise<IngestResult>) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { error: "Use POST" }, { Allow: "POST" });
    const bearer = request.headers.get("Authorization")?.match(/^Bearer (atm_[A-Za-z0-9_-]{43})$/i);
    if (!bearer) return json(401, { error: "Unauthorized" });
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return json(415, { error: "Use application/json" });
    if (Number(request.headers.get("Content-Length")) > MAX_BODY)
      return json(413, { error: "Payload too large" });
    let body: unknown;
    const reader = request.body?.getReader();
    if (!reader) return json(400, { error: "Missing JSON body" });
    try {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {
          await reader.cancel();
          return json(413, { error: "Payload too large" });
        }
        chunks.push(value);
      }
      const buffer = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    } catch {
      return json(400, { error: "Invalid JSON" });
    } finally { reader.releaseLock(); }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json(422, { error: "Invalid reading" });
    const reading = body as Record<string, unknown>;
    if (Object.keys(reading).some((key) => !["device_id", "temperature", "humidity"].includes(key)) ||
        typeof reading.device_id !== "string" || !uuid.test(reading.device_id) ||
        typeof reading.temperature !== "number" || !Number.isFinite(reading.temperature) ||
        reading.temperature < -40 || reading.temperature > 85 ||
        typeof reading.humidity !== "number" || !Number.isFinite(reading.humidity) ||
        reading.humidity < 0 || reading.humidity > 100)
      return json(422, { error: "Expected device UUID, temperature -40 to 85 C, humidity 0 to 100%" });
    const requestId = request.headers.get("X-Reading-Id") ?? crypto.randomUUID();
    if (!uuid.test(requestId)) return json(422, { error: "X-Reading-Id must be a UUID" });
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearer[1]));
      const keyHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const result = await ingest({
        p_device_id: reading.device_id, p_key_hash: keyHash,
        p_temperature: reading.temperature, p_humidity: reading.humidity, p_request_id: requestId,
      });
      if (![200, 201, 401, 403, 409, 422, 429].includes(result.status)) throw new Error("Invalid result");
      const { status, retry_after, ...response } = result;
      return json(status, response, retry_after ? { "Retry-After": String(retry_after) } : {});
    } catch {
      // Never log Authorization, raw payloads, hashes, or database error details.
      return json(503, { error: "Ingestion temporarily unavailable" }, { "Retry-After": "30" });
    }
  };
}
