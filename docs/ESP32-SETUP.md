# Connect an ESP32-C3 Super Mini to Atmos

The SmartHome ingestion endpoint is deployed at:

```text
https://sibafmauprgdkillmkks.supabase.co/functions/v1/readings
```

Atmos is a private, statically exported Next.js site. Sensor uploads go directly to this Supabase Edge Function, so the board needs neither a website login nor a Sites access token. There is no Next.js `/api/readings` server in the static deployment. The Edge Function is the equivalent HTTPS API and writes to the existing `public.sensor_readings` table.

## 1. Wire the sensor

Disconnect power while wiring:

- SHT31 VIN → ESP32 **3.3V**
- SHT31 GND → ESP32 GND
- SHT31 SDA → ESP32 **GPIO 8**
- SHT31 SCL → ESP32 **GPIO 9**

The firmware uses I2C at 100 kHz and tries addresses `0x44`, then `0x45`. Most SHT31 breakout boards include pull-ups. If yours does not, fit SDA/SCL pull-ups (typically 4.7 kΩ) to **3.3V**, not 5V. Keep leads short. Keep the sensor away from ESP32 heat and direct sunlight.

GPIO 8 and GPIO 9 are ESP32-C3 boot strapping pins. Their normal I2C idle state is high. Do not hold either low at reset except the deliberate BOOT procedure below. Do not use the Super Mini's GPIO 8 LED in this sketch; that pin is SDA. Board variants differ, so check the labels on your board. If the attached sensor prevents boot/flashing, temporarily disconnect SDA/SCL while flashing, then restore them with power removed.

## 2. Configure this board

Copy `firmware/include/secrets.example.h` to `firmware/include/secrets.h`. This file is ignored by Git.

Set these five values:

```cpp
static const char WIFI_SSID[] = "your 2.4 GHz Wi-Fi name";
static const char WIFI_PASSWORD[] = "your Wi-Fi password";
static const char DEVICE_ID[] = "your existing devices.id UUID";
static const char DEVICE_API_KEY[] = "atm_your_unique_device_secret";
static const char API_URL[] = "https://sibafmauprgdkillmkks.supabase.co/functions/v1/readings";
```

The initial per-room credentials were supplied separately in `atmos-device-credentials.json`, outside this repository. Choose the entry for the actual room. For example, Living room is device `00000000-0000-4000-8000-000000000001`. Each physical sensor needs a different existing device UUID and its matching secret. Do not reuse a room's credential on a second sensor. The ESP32-C3 supports 2.4 GHz Wi-Fi; a 5 GHz-only SSID will not work.

Never put a Supabase service-role/secret key, your Atmos password, or the site's access token on the board. Keep the credential JSON and `secrets.h` private. Compiled firmware contains the device secret, so do not publish configured firmware binaries either. The checked-in example contains placeholders only.

## 3. Build and flash with PlatformIO

Install VS Code with the **PlatformIO IDE** extension, or install PlatformIO Core. Open the repository's `firmware` directory as the PlatformIO project. The configuration pins Espressif32 8.0.0, Adafruit SHT31 2.2.2, and Adafruit BusIO 1.17.4. It uses the ESP32-C3 DevKitM-1 profile for a typical 4 MB Super Mini and enables native USB CDC. If your Super Mini has different flash hardware, confirm its specifications before changing the board profile.

From the `firmware` directory:

```sh
pio run -e testing
pio device list
pio run -e testing -t upload --upload-port COM7
pio device monitor --port COM7 --baud 115200
```

Replace `COM7` with your Windows port (or `/dev/ttyACM0` on Linux). The PlatformIO UI also has Build, Upload, and Monitor buttons. Use a **USB data cable**. Close the serial monitor before uploading.

On Windows, the current ESP32 framework contains long filenames. If package installation fails with `WinError 3` or a missing path, use a short project/cache location and Windows long-path support. A temporary drive mapping to your local PlatformIO cache also works; no firmware source change is needed.

If the upload cannot connect:

1. Hold **BOOT** (GPIO 9).
2. Press/release **RESET**, then release BOOT, or plug USB in while holding BOOT.
3. Check the port again; USB enumeration may change it.
4. Upload. Press RESET afterward if needed to run the sketch.

The default `testing` environment takes a fresh sample at startup and starts another cycle every **60 seconds**. Network failures have bounded waits/retries, so a failed cycle can take longer. The sample is read before Wi-Fi starts to reduce heating bias. Serial output never prints secrets.

The firmware is an Arduino C++ example built by PlatformIO. All web/API code remains TypeScript. No USB hardware was available during software verification; flashing and sensor accuracy still need to be checked on your board.

## 4. Verify actual readings

Successful serial output looks like:

```text
Upload HTTP 201 (attempt 1)
Accepted 21.40 C, 48.20 % RH
```

`200` also means success: that exact request was already stored, usually after a network retry. In Supabase SQL Editor, inspect the existing table:

```sql
select d.room, r.temperature, r.humidity, r.created_at
from public.sensor_readings r
join public.devices d on d.id = r.device_id
where d.id = '00000000-0000-4000-8000-000000000001'
order by r.created_at desc
limit 10;
```

Sign into Atmos. Cards and open charts fetch new data every **60 seconds**, and immediately when the page returns to the foreground or reconnects. No build or deployment is needed for new readings or devices. The status clock updates every 15 seconds. A device with a reading **less than 10 minutes old** is online; at 10 minutes it becomes offline. Inactive devices and devices with no readings retain their separate states. Last-known values remain visible when offline.

Stop power for at least 10 minutes to check the offline transition, then reconnect and allow up to one refresh interval. Historical charts use 15-minute, hourly, and 6-hour averages for 24h, 7d, and 30d; a card shows the latest individual sample. Existing seed data remains in history and can be distinguished from new uploads by `ingest_request_id is null`.

HTTP troubleshooting:

- `401`: missing/wrong/revoked key, unknown UUID, or a key belonging to another device.
- `403`: the authenticated device is inactive (`devices.active = false`).
- `409`: an `X-Reading-Id` was reused with different values.
- `413` / `415` / `422`: body too large, wrong content type, or invalid payload.
- `429`: another new reading arrived less than 30 seconds ago; wait for the next cycle. The API returns `Retry-After`.
- `503` / other `5xx`: temporary backend failure; firmware retries up to three attempts.
- Negative HTTP status: Wi-Fi, DNS, time synchronization, or TLS failure. Check network access, NTP and the API URL. Never solve this by calling `setInsecure()`.

## 5. Switch to five-minute sleep

After verifying real readings, flash the other environment:

```sh
pio run -e low_power
pio run -e low_power -t upload --upload-port COM7
```

Every wake boots the sketch, initializes I2C, reads SHT31, connects Wi-Fi, synchronizes the clock, uploads, shuts down Wi-Fi/I2C, and enters deep sleep for **300 seconds**. It also sleeps after failed attempts. The actual interval between accepted readings is five minutes plus awake time. USB serial disappears during deep sleep; use BOOT/RESET if needed for the next upload.

No readings are buffered across sleeps: reconnecting reports a fresh sample rather than stamping old data as current. The Super Mini regulator, power LED, USB circuit, and powered SHT31 still consume current. Measure your actual board before estimating battery life; chip deep-sleep specifications are not whole-board consumption.

## API contract and security

```http
POST /functions/v1/readings
Authorization: Bearer atm_DEVICE_SECRET
Content-Type: application/json
X-Reading-Id: a_unique_uuid_for_this_sample

{"device_id":"00000000-0000-4000-8000-000000000001","temperature":21.4,"humidity":48.2}
```

`X-Reading-Id` is optional for simple clients, but the firmware always supplies it. Reuse it only while retrying the same sample. Successful responses contain a string `id`, server UTC `created_at`, and `duplicate` boolean. New samples return `201`; identical retries return `200`. Temperatures must be numbers from **-40 to 85°C**, humidity from **0 to 100%**. Extra fields, strings and non-finite values are rejected. Body limit: 1 KiB. The server assigns receipt time; the board does not choose a database timestamp.

Each secret contains 32 cryptographically random bytes. The server keeps only its SHA-256 hash in `private.device_ingest_credentials`, a table outside the exposed API schema with RLS and no viewer grants. Hashes of high-entropy API secrets do not need password-style slow hashing. `public.ingest_reading` is an invoker function executable only by `service_role`; checking the hash, active flag, deduplication and 30-second rate limit happens in the same transaction as insertion. Viewer and anonymous clients cannot execute it or insert readings directly.

The Edge Function uses Supabase's server-injected `SUPABASE_SERVICE_ROLE_KEY`; it is never included in frontend builds or firmware. `verify_jwt = false` is intentional: the endpoint authenticates the per-device bearer secret itself, rather than requiring a Supabase user JWT. The private dashboard's read-only RLS policies remain in force.

The firmware validates HTTPS hostname/certificate using GTS Root R4 in `include/root-ca.h`, matched to SmartHome's TLS chain on 2026-11-06. NTP sets the clock for certificate validity checks. If the hosting certificate authority changes, update the trust anchor from the authority's official repository after validating the new chain, then reflash. Do not pin the short-lived leaf certificate or disable validation.

## Add, rotate or revoke a device key

For a new physical device, first create a row in **the existing `public.devices` table** using Supabase Table Editor and note its generated UUID. Existing rooms need no new row. Run this local administrator helper from the repository root, using a unique output prefix outside the repository:

```sh
node scripts/create-device-key.mjs YOUR_DEVICE_UUID ../bedroom-2026-11
```

It writes a private `.device-key.json` and a `.device-key.sql` containing only the hash. It prints filenames, never the secret. Run that SQL in SmartHome's SQL Editor as the project administrator. This creates or immediately rotates only that device's credential. Copy the new secret to that board's `secrets.h` and reflash. The old key stops working immediately. The helper refuses to overwrite existing output files; use a new prefix each time. Never commit either onboarding file.

To revoke a key without removing readings:

```sql
update private.device_ingest_credentials
set revoked_at = now()
where device_id = 'YOUR_DEVICE_UUID';
```

To temporarily disable a sensor:

```sql
update public.devices set active = false where id = 'YOUR_DEVICE_UUID';
```

## Reproduce the backend in another project

SmartHome already has this installed. Do not rerun the original schema or seed on it. For a fresh project, run `supabase/schema.sql`, then `supabase/ingestion.sql`; add devices and viewer authorization following the main README. For an existing Atmos schema, apply only `ingestion.sql` once. This upgrade adds credential metadata and a nullable retry UUID on the existing readings table; it preserves existing rows.

Deploy the `supabase/functions/readings` files as the `readings` Edge Function with JWT verification disabled **and the custom authentication code intact**. The checked-in `supabase/config.toml` records that setting. Use Supabase's current CLI help or Dashboard deployment flow. Provision keys using the helper, then update `API_URL` and validate that project's TLS chain before flashing. No API secret needs to be entered into the website's build environment.

References: [Supabase Edge secrets](https://supabase.com/docs/guides/functions/secrets), [Arduino ESP32 I2C](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/i2c.html), [ESP32-C3 sleep](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-reference/system/sleep_modes.html), [ESP32-C3 GPIO/strapping pins](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-reference/peripherals/gpio.html), [Adafruit SHT31](https://github.com/adafruit/Adafruit_SHT31), [Google Trust Services roots](https://pki.goog/repository/).
