#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <esp_sleep.h>
#include <esp_random.h>
#include <time.h>
#include "secrets.h"
#include "root-ca.h"

#ifndef ATMOS_LOW_POWER
#define ATMOS_LOW_POWER 0
#endif
constexpr uint8_t SDA_PIN = 8;
constexpr uint8_t SCL_PIN = 9;
constexpr uint32_t TEST_INTERVAL_MS = 60000;
constexpr uint64_t SLEEP_SECONDS = 300;
Adafruit_SHT31 sht31;
uint32_t cycleStarted = 0;

bool connectWifiAndClock() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) delay(100);
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi timeout; check SSID, password, and 2.4 GHz coverage.");
    return false;
  }
  // Certificate validation needs the current time. Never disable TLS checks.
  configTime(0, 0, "time.cloudflare.com", "pool.ntp.org", "time.google.com");
  const uint32_t clockStart = millis();
  while (time(nullptr) < 1767225600 && millis() - clockStart < 15000) delay(100);
  if (time(nullptr) < 1767225600) {
    Serial.println("Clock sync failed; upload skipped to preserve TLS validation.");
    return false;
  }
  return true;
}

String requestUuid() {
  // RF is running now, so esp_fill_random has the Wi-Fi entropy source.
  uint8_t bytes[16];
  esp_fill_random(bytes, sizeof(bytes));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  char result[37];
  snprintf(result, sizeof(result),
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],
    bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]);
  return String(result);
}

bool uploadReading(float temperature, float humidity) {
  if (!String(API_URL).startsWith("https://")) {
    Serial.println("API_URL must use HTTPS.");
    return false;
  }
  const String requestId = requestUuid();
  char payload[160];
  snprintf(payload, sizeof(payload), "{\"device_id\":\"%s\",\"temperature\":%.2f,\"humidity\":%.2f}",
    DEVICE_ID, temperature, humidity);
  for (uint8_t attempt = 0; attempt < 3; ++attempt) {
    WiFiClientSecure tls;
    tls.setCACert(ROOT_CA);
    tls.setHandshakeTimeout(12);
    HTTPClient http;
    http.setConnectTimeout(10000);
    http.setTimeout(10000);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    if (!http.begin(tls, API_URL)) return false;
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + DEVICE_API_KEY);
    http.addHeader("X-Reading-Id", requestId);
    const int status = http.POST(reinterpret_cast<uint8_t*>(payload), strlen(payload));
    // Never print Wi-Fi passwords or API keys. HTTP status is enough to diagnose.
    Serial.printf("Upload HTTP %d (attempt %u)\n", status, attempt + 1);
    http.end();
    if (status == 201 || status == 200) {
      Serial.printf("Accepted %.2f C, %.2f %% RH\n", temperature, humidity);
      return true;
    }
    // 429 waits until the next scheduled cycle. Other 4xx/configuration failures
    // need operator correction. Retries reuse both the payload and UUID.
    if (status > 0 && status < 500) return false;
    if (attempt < 2) delay(1000 * (attempt + 1));
  }
  return false;
}

void readAndSend() {
  if (strcmp(WIFI_SSID, "YOUR_WIFI_SSID") == 0 || strncmp(DEVICE_API_KEY, "atm_", 4) != 0) {
    Serial.println("Configure include/secrets.h before using the sensor.");
    return;
  }
  // Read before Wi-Fi activity warms the board. Place the sensor away from ESP32.
  if (!sht31.begin(0x44) && !sht31.begin(0x45)) {
    Serial.println("SHT31 not found at 0x44 or 0x45. Check 3.3V, SDA 8, SCL 9.");
    return;
  }
  sht31.heater(false);
  float temperature, humidity;
  if (!sht31.readBoth(&temperature, &humidity) || !isfinite(temperature) || !isfinite(humidity) ||
      temperature < -40 || temperature > 85 || humidity < 0 || humidity > 100) {
    Serial.println("Invalid SHT31 sample; upload skipped.");
    return;
  }
  if (connectWifiAndClock()) uploadReading(temperature, humidity);
  // No stale sample buffer: the next cycle obtains a new measurement.
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

void setup() {
  Serial.begin(115200);
  delay(300); // Bounded; never wait indefinitely for a USB monitor.
  Wire.begin(SDA_PIN, SCL_PIN, 100000);
  Wire.setTimeOut(100);
  cycleStarted = millis();
  readAndSend();
#if ATMOS_LOW_POWER
  Serial.println("Sleeping for 5 minutes.");
  Serial.flush();
  Wire.end();
  esp_sleep_enable_timer_wakeup(SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
#endif
}

void loop() {
#if !ATMOS_LOW_POWER
  if (millis() - cycleStarted >= TEST_INTERVAL_MS) {
    cycleStarted = millis();
    readAndSend();
  }
  delay(50);
#endif
}
