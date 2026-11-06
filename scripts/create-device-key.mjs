// Offline administrator helper. No Supabase key is needed. Does not change DB.
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const [deviceId, outputPrefix] = process.argv.slice(2);
if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(deviceId ?? "") || !outputPrefix) {
  console.error("Usage: node scripts/create-device-key.mjs DEVICE_UUID OUTPUT_PREFIX");
  process.exit(1);
}
const key = `atm_${randomBytes(32).toString("base64url")}`;
const hash = createHash("sha256").update(key).digest("hex");
const secretPath = resolve(`${outputPrefix}.device-key.json`);
const sqlPath = resolve(`${outputPrefix}.device-key.sql`);
// Exclusive create prevents accidental loss of the only plaintext copy.
writeFileSync(secretPath, JSON.stringify({ device_id: deviceId, api_key: key }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
writeFileSync(sqlPath, `-- Run as administrator. Replaces this device's previous credential immediately.\ninsert into private.device_ingest_credentials(device_id,key_hash)\nvalues ('${deviceId}','${hash}')\non conflict (device_id) do update set key_hash=excluded.key_hash, rotated_at=now(), revoked_at=null;\n`, { flag: "wx", mode: 0o600 });
console.log(`Private credential saved to ${secretPath}\nAdministrator SQL saved to ${sqlPath}\nNo database changes made. Keep the JSON out of Git and backups shared with others.`);
