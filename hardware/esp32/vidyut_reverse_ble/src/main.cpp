#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <mbedtls/md.h>
#include <map>
#include <time.h>

#include "../include/secrets.h"

namespace {
constexpr uint32_t kScanInterval = 160;
constexpr uint32_t kScanWindow = 80;
constexpr uint32_t kSessionPollIntervalMs = 5000;
constexpr uint32_t kUploadIntervalMs = 3000;
constexpr uint32_t kReconnectIntervalMs = 15000;
constexpr size_t kMaxStudents = 150;
constexpr int8_t kDefaultRssiThreshold = -78;

struct AttendanceRecord {
  uint32_t rollId = 0;
  int rssi = -127;
  String proof;
  String nonce;
};

struct ActiveSession {
  String id;
  String nonce;
  uint8_t nonceBytes[4] = {0, 0, 0, 0};
  int8_t minRssi = kDefaultRssiThreshold;
  bool active = false;
};

ActiveSession session;
std::map<uint32_t, AttendanceRecord> records;
NimBLEScan *scanner = nullptr;
unsigned long lastPollAt = 0;
unsigned long lastUploadAt = 0;
unsigned long lastReconnectAt = 0;
unsigned long lastTimeSyncAt = 0;
bool scanning = false;
bool initialized = false;
SemaphoreHandle_t recordsMutex = nullptr;

bool decodeHex(const String &value, uint8_t *output, size_t outputLength) {
  if (value.length() != outputLength * 2) return false;
  for (size_t i = 0; i < outputLength; ++i) {
    const char highChar = value[i * 2];
    const char lowChar = value[i * 2 + 1];
    const int high = highChar >= '0' && highChar <= '9' ? highChar - '0'
        : highChar >= 'a' && highChar <= 'f' ? highChar - 'a' + 10
        : highChar >= 'A' && highChar <= 'F' ? highChar - 'A' + 10 : -1;
    const int low = lowChar >= '0' && lowChar <= '9' ? lowChar - '0'
        : lowChar >= 'a' && lowChar <= 'f' ? lowChar - 'a' + 10
        : lowChar >= 'A' && lowChar <= 'F' ? lowChar - 'A' + 10 : -1;
    if (high < 0 || low < 0) return false;
    output[i] = static_cast<uint8_t>((high << 4) | low);
  }
  return true;
}

String toHex(const uint8_t *value, size_t length) {
  static const char digits[] = "0123456789abcdef";
  String output;
  output.reserve(length * 2);
  for (size_t i = 0; i < length; ++i) {
    output += digits[value[i] >> 4];
    output += digits[value[i] & 0x0f];
  }
  return output;
}

String compactUuid(const String &uuid) {
  String compact = uuid;
  compact.replace("-", "");
  compact.toLowerCase();
  return compact;
}

bool hmacSha256(const uint8_t *key, size_t keyLength, const uint8_t *message,
                size_t messageLength, uint8_t output[32]) {
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  return info && mbedtls_md_hmac(info, key, keyLength, message, messageLength, output) == 0;
}

bool signingKey(uint8_t key[32]) {
  return decodeHex(VIDYUT_SIGNING_SECRET_HEX, key, 32);
}

bool safeConfig() {
  if (String(VIDYUT_NODE_ID).isEmpty()
      || String(VIDYUT_BEACON_ID).length() < 4
      || String(VIDYUT_BEACON_ID).startsWith("replace-")
      || String(VIDYUT_TENANT_DOMAIN).isEmpty()
      || String(VIDYUT_WIFI_SSID).isEmpty()
      || String(VIDYUT_WIFI_SSID).startsWith("replace-")
      || String(VIDYUT_WIFI_PASSWORD).startsWith("replace-")
      || String(VIDYUT_API_BASE_URL).indexOf("https://") != 0
      || String(VIDYUT_API_ROOT_CA).isEmpty()
      || String(VIDYUT_SIGNING_SECRET_HEX).length() != 64) {
    Serial.println("Required online device configuration is missing; attendance is disabled.");
    return false;
  }
  uint8_t key[32];
  if (!signingKey(key)) {
    Serial.println("The device signing secret must be 32 bytes of hexadecimal.");
    return false;
  }
  memset(key, 0, sizeof(key));
  return true;
}

std::map<uint32_t, AttendanceRecord> recordSnapshot() {
  std::map<uint32_t, AttendanceRecord> snapshot;
  if (recordsMutex) xSemaphoreTake(recordsMutex, portMAX_DELAY);
  snapshot = records;
  if (recordsMutex) xSemaphoreGive(recordsMutex);
  return snapshot;
}

String serializeRecords(const std::map<uint32_t, AttendanceRecord> &snapshot) {
  JsonDocument document;
  JsonArray array = document.to<JsonArray>();
  for (const auto &entry : snapshot) {
    JsonObject item = array.add<JsonObject>();
    item["student_roll_id"] = entry.second.rollId;
    item["rssi"] = entry.second.rssi;
    item["proof"] = entry.second.proof;
    item["session_nonce"] = entry.second.nonce;
  }
  String output;
  serializeJson(document, output);
  return output;
}

void clearRecords() {
  if (recordsMutex) xSemaphoreTake(recordsMutex, portMAX_DELAY);
  records.clear();
  if (recordsMutex) xSemaphoreGive(recordsMutex);
}

void clearUploadedRecords(const std::map<uint32_t, AttendanceRecord> &uploaded) {
  if (recordsMutex) xSemaphoreTake(recordsMutex, portMAX_DELAY);
  for (const auto &entry : uploaded) {
    const auto current = records.find(entry.first);
    if (current != records.end()
        && current->second.rssi == entry.second.rssi
        && current->second.proof == entry.second.proof
        && current->second.nonce == entry.second.nonce) {
      records.erase(current);
    }
  }
  if (recordsMutex) xSemaphoreGive(recordsMutex);
}

void stopScanner() {
  if (scanner && scanning) scanner->stop();
  scanning = false;
}

void resetSession() {
  stopScanner();
  session = ActiveSession();
  clearRecords();
}

String apiUrl(const char *path) {
  String base = VIDYUT_API_BASE_URL;
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + path;
}

String encodeQueryValue(const String &value) {
  static const char hex[] = "0123456789ABCDEF";
  String result;
  for (size_t i = 0; i < value.length(); ++i) {
    const unsigned char ch = static_cast<unsigned char>(value[i]);
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
        || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.') {
      result += static_cast<char>(ch);
    } else {
      result += '%';
      result += hex[ch >> 4];
      result += hex[ch & 0x0f];
    }
  }
  return result;
}

bool syncClock() {
  lastTimeSyncAt = millis();
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  const unsigned long deadline = millis() + 15000;
  while (time(nullptr) < 1700000000 && millis() < deadline) delay(250);
  if (time(nullptr) < 1700000000) {
    Serial.println("NTP time sync is unavailable; authenticated session polling is paused.");
    return false;
  }
  lastTimeSyncAt = millis();
  return true;
}

void startScanner() {
  if (!session.active || !scanner || scanning) return;
  scanner->setActiveScan(false);
  scanner->setInterval(kScanInterval);
  scanner->setWindow(kScanWindow);
  scanner->setDuplicateFilter(false);
  if (scanner->start(0, false, false)) {
    scanning = true;
    Serial.printf("Scanning for session %s.\n", session.id.c_str());
  } else {
    Serial.println("Could not start passive BLE scanning.");
  }
}

class AttendanceScanCallbacks final : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice *device) override {
    if (!session.active || device == nullptr || !device->haveServiceUUID()) return;
    const String compact = compactUuid(String(device->getServiceUUID().toString().c_str()));
    if (compact.length() != 32 || compact.substring(0, 4) != "564f") return;
    uint8_t bytes[16];
    if (!decodeHex(compact, bytes, sizeof(bytes))) return;
    if (bytes[2] != session.nonceBytes[0] || bytes[3] != session.nonceBytes[1]) return;

    const uint32_t rollId = (static_cast<uint32_t>(bytes[4]) << 24)
        | (static_cast<uint32_t>(bytes[5]) << 16)
        | (static_cast<uint32_t>(bytes[6]) << 8)
        | static_cast<uint32_t>(bytes[7]);
    const int rssi = device->getRSSI();
    if (!rollId || rssi < session.minRssi) return;

    if (recordsMutex) xSemaphoreTake(recordsMutex, portMAX_DELAY);
    if (records.size() >= kMaxStudents && records.find(rollId) == records.end()) {
      if (recordsMutex) xSemaphoreGive(recordsMutex);
      return;
    }
    const auto found = records.find(rollId);
    if (found != records.end() && found->second.rssi >= rssi) {
      if (recordsMutex) xSemaphoreGive(recordsMutex);
      return;
    }

    AttendanceRecord record;
    record.rollId = rollId;
    record.rssi = rssi;
    record.proof = toHex(bytes + 8, 8);
    record.nonce = session.nonce;
    records[rollId] = record;
    if (recordsMutex) xSemaphoreGive(recordsMutex);
  }
};

AttendanceScanCallbacks scanCallbacks;

bool refreshActiveSession() {
  if (WiFi.status() != WL_CONNECTED) return false;
  const time_t now = time(nullptr);
  if (now < 1700000000) return false;

  uint8_t key[32], digest[32];
  if (!signingKey(key)) {
    Serial.println("The ESP32 signing secret could not be decoded.");
    return false;
  }
  const String timestamp = String(static_cast<uint32_t>(now));
  const String signedMessage = String(VIDYUT_BEACON_ID) + "|" + timestamp;
  const bool signedOk = hmacSha256(
      key, sizeof(key),
      reinterpret_cast<const uint8_t *>(signedMessage.c_str()),
      signedMessage.length(), digest);
  memset(key, 0, sizeof(key));
  if (!signedOk) return false;

  WiFiClientSecure tls;
  tls.setCACert(VIDYUT_API_ROOT_CA);
  HTTPClient http;
  const String url = apiUrl("/api/attendance/esp32-active-session?beacon_id=")
      + encodeQueryValue(VIDYUT_BEACON_ID);
  if (!http.begin(tls, url)) {
    memset(digest, 0, sizeof(digest));
    Serial.println("Could not initialize the active-session API request.");
    return false;
  }
  http.addHeader("Accept", "application/json");
  http.addHeader("X-Campus-Domain", VIDYUT_TENANT_DOMAIN);
  http.addHeader("X-Vidyut-Timestamp", timestamp);
  http.addHeader("X-Vidyut-Signature", toHex(digest, sizeof(digest)));
  memset(digest, 0, sizeof(digest));

  const int status = http.GET();
  if (status != HTTP_CODE_OK) {
    if (status < 0) Serial.printf("Active-session poll failed: %s\n", http.errorToString(status).c_str());
    else Serial.printf("Active-session API returned HTTP %d.\n", status);
    http.end();
    resetSession();
    return false;
  }
  JsonDocument payload;
  const DeserializationError parseError = deserializeJson(payload, http.getString());
  http.end();
  if (parseError) {
    Serial.println("The active-session response was not valid JSON.");
    resetSession();
    return false;
  }
  if (!(payload["active"] | false)) {
    if (session.active) {
      Serial.println("The attendance session is no longer active.");
      resetSession();
    }
    return true;
  }

  const String sessionId = String(payload["session_id"] | "");
  const String nonce = String(payload["session_nonce"] | "");
  const int minRssi = payload["min_rssi"] | static_cast<int>(kDefaultRssiThreshold);
  const uint32_t expiresAt = payload["expires_at"] | 0U;
  uint8_t nonceBytes[4];
  if (sessionId.isEmpty() || !decodeHex(nonce, nonceBytes, sizeof(nonceBytes))
      || minRssi < -100 || minRssi > 0 || expiresAt <= static_cast<uint32_t>(now)) {
    Serial.println("The active-session response contains invalid fields.");
    resetSession();
    return false;
  }

  if (session.active && session.id == sessionId && session.nonce == nonce) {
    session.minRssi = static_cast<int8_t>(minRssi);
    return true;
  }

  stopScanner();
  clearRecords();
  session.id = sessionId;
  session.nonce = nonce;
  memcpy(session.nonceBytes, nonceBytes, sizeof(session.nonceBytes));
  session.minRssi = static_cast<int8_t>(minRssi);
  session.active = true;
  startScanner();
  Serial.printf("Online attendance session started: %s.\n", session.id.c_str());
  return true;
}

String newBatchId() {
  uint8_t randomBytes[8];
  const uint32_t first = esp_random();
  const uint32_t second = esp_random();
  memcpy(randomBytes, &first, sizeof(first));
  memcpy(randomBytes + sizeof(first), &second, sizeof(second));
  const String suffix = toHex(randomBytes, sizeof(randomBytes));
  memset(randomBytes, 0, sizeof(randomBytes));
  return String("VNODE-") + VIDYUT_NODE_ID + "-" + suffix;
}

bool uploadBatch() {
  if (WiFi.status() != WL_CONNECTED || !session.active) return false;
  const auto snapshot = recordSnapshot();
  if (snapshot.empty()) return false;

  const String rawRecords = serializeRecords(snapshot);
  uint8_t key[32], digest[32];
  if (!signingKey(key) || !hmacSha256(
          key, sizeof(key), reinterpret_cast<const uint8_t *>(rawRecords.c_str()),
          rawRecords.length(), digest)) {
    memset(key, 0, sizeof(key));
    Serial.println("Could not sign the attendance batch.");
    resetSession();
    return false;
  }
  JsonDocument payload;
  payload["batch_id"] = newBatchId();
  payload["session_id"] = session.id;
  payload["beacon_id"] = VIDYUT_BEACON_ID;
  payload["raw_records_json"] = rawRecords;
  payload["esp32_batch_signature"] = toHex(digest, sizeof(digest));
  String body;
  serializeJson(payload, body);
  memset(key, 0, sizeof(key));
  memset(digest, 0, sizeof(digest));

  WiFiClientSecure tls;
  tls.setCACert(VIDYUT_API_ROOT_CA);
  HTTPClient http;
  if (!http.begin(tls, apiUrl("/api/attendance/esp32-batch"))) {
    Serial.println("Could not initialize the attendance batch upload.");
    resetSession();
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Campus-Domain", VIDYUT_TENANT_DOMAIN);
  const int status = http.POST(body);
  const bool uploaded = status >= 200 && status < 300;
  if (status < 0) Serial.printf("Attendance batch upload failed: %s\n", http.errorToString(status).c_str());
  else if (!uploaded) Serial.printf("Attendance API returned HTTP %d.\n", status);
  http.end();
  if (uploaded) clearUploadedRecords(snapshot);
  else resetSession();
  return uploaded;
}

void connectCampusWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);
  WiFi.begin(VIDYUT_WIFI_SSID, VIDYUT_WIFI_PASSWORD);
  for (uint8_t attempt = 0; attempt < 3; ++attempt) {
    const unsigned long deadline = millis() + 10000;
    while (WiFi.status() != WL_CONNECTED && millis() < deadline) delay(100);
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("Connected to campus Wi-Fi.");
      syncClock();
      return;
    }
    WiFi.disconnect();
    delay(500);
    WiFi.begin(VIDYUT_WIFI_SSID, VIDYUT_WIFI_PASSWORD);
  }
  Serial.println("Campus Wi-Fi is unavailable; attendance scanning remains disabled.");
}
}  // namespace

void setup() {
  Serial.begin(115200);
  if (!safeConfig()) return;
  recordsMutex = xSemaphoreCreateMutex();
  if (recordsMutex == nullptr) {
    Serial.println("Could not initialize the attendance data lock.");
    return;
  }
  NimBLEDevice::init(String(VIDYUT_NODE_ID).c_str());
  scanner = NimBLEDevice::getScan();
  scanner->setScanCallbacks(&scanCallbacks, false);
  connectCampusWifi();
  initialized = true;
}

void loop() {
  if (!initialized) {
    delay(1000);
    return;
  }

  const unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if (session.active || scanning) resetSession();
    if (now - lastReconnectAt >= kReconnectIntervalMs) {
      lastReconnectAt = now;
      WiFi.reconnect();
    }
    delay(25);
    return;
  }

  if (now - lastTimeSyncAt >= 3600000UL || time(nullptr) < 1700000000) {
    syncClock();
  }
  if (time(nullptr) < 1700000000) {
    resetSession();
    delay(25);
    return;
  }
  if (now - lastPollAt >= kSessionPollIntervalMs) {
    lastPollAt = now;
    refreshActiveSession();
  }
  if (session.active && !scanning) startScanner();
  if (session.active && now - lastUploadAt >= kUploadIntervalMs) {
    lastUploadAt = now;
    uploadBatch();
  }
  delay(10);
}
