#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <NimBLEDevice.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <mbedtls/md.h>
#include <map>
#include <string>

#include "../include/secrets.h"

namespace {
constexpr char kBatchPath[] = "/active_batch.jsonl";
constexpr char kSessionPath[] = "/active_session.json";
constexpr uint32_t kScanInterval = 160;
constexpr uint32_t kScanWindow = 80;
constexpr uint32_t kAdvertiseInterval = 320;
constexpr uint32_t kUploadIntervalMs = 3000;
constexpr uint8_t kMaxStudents = 150;
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
  String serviceUuid;
  String batchId;
  String offlineSessionJson;
  String facultyKeyId;
  String facultySignature;
  uint32_t expiresAt = 0;
  uint32_t durationSeconds = 0;
  uint16_t locationId = 0;
  uint8_t nonceBytes[4] = {0, 0, 0, 0};
  bool active = false;
};

ActiveSession session;
std::map<uint32_t, AttendanceRecord> records;
NimBLEAdvertising *advertising = nullptr;
NimBLEScan *scanner = nullptr;
WebServer localServer(80);
unsigned long sessionStartedAt = 0;
unsigned long lastUploadAt = 0;
unsigned long lastReconnectAt = 0;
uint8_t wifiFailures = 0;
bool apEnabled = false;
bool initialized = false;
bool persistenceHealthy = true;
SemaphoreHandle_t recordsMutex = nullptr;

bool decodeHex(const String &value, uint8_t *output, size_t outputLength) {
  if (value.length() != outputLength * 2) return false;
  for (size_t i = 0; i < outputLength; ++i) {
    char highChar = value[i * 2];
    char lowChar = value[i * 2 + 1];
    int high = highChar >= '0' && highChar <= '9' ? highChar - '0'
        : highChar >= 'a' && highChar <= 'f' ? highChar - 'a' + 10
        : highChar >= 'A' && highChar <= 'F' ? highChar - 'A' + 10 : -1;
    int low = lowChar >= '0' && lowChar <= '9' ? lowChar - '0'
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

String formatUuid(const uint8_t value[16]) {
  const String compact = toHex(value, 16);
  return compact.substring(0, 8) + "-" + compact.substring(8, 12) + "-"
      + compact.substring(12, 16) + "-" + compact.substring(16, 20) + "-"
      + compact.substring(20, 32);
}

bool constantTimeEqual(const uint8_t *left, const uint8_t *right, size_t length) {
  uint8_t difference = 0;
  for (size_t i = 0; i < length; ++i) difference |= left[i] ^ right[i];
  return difference == 0;
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
  if (String(VIDYUT_NODE_ID).isEmpty() || String(VIDYUT_BEACON_ID).isEmpty()
      || String(VIDYUT_AP_PASSWORD).length() < 12
      || String(VIDYUT_AP_PASSWORD).startsWith("replace-")
      || String(VIDYUT_BEACON_ID).startsWith("replace-")
      || String(VIDYUT_SIGNING_SECRET_HEX).length() != 64) {
    Serial.println("Required device configuration is missing; BLE attendance is disabled.");
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

String serializeRecords() {
  if (recordsMutex) xSemaphoreTake(recordsMutex, portMAX_DELAY);
  JsonDocument document;
  JsonArray array = document.to<JsonArray>();
  for (const auto &entry : records) {
    JsonObject item = array.add<JsonObject>();
    item["student_roll_id"] = entry.second.rollId;
    item["rssi"] = entry.second.rssi;
    item["proof"] = entry.second.proof;
    item["session_nonce"] = entry.second.nonce;
  }
  String output;
  serializeJson(document, output);
  if (recordsMutex) xSemaphoreGive(recordsMutex);
  return output;
}

bool persistRecord(const AttendanceRecord &record) {
  File file = LittleFS.open(kBatchPath, FILE_APPEND);
  if (!file) {
    Serial.println("Could not open LittleFS attendance batch for append.");
    return false;
  }
  JsonDocument document;
  document["student_roll_id"] = record.rollId;
  document["rssi"] = record.rssi;
  document["proof"] = record.proof;
  document["session_nonce"] = record.nonce;
  document["session_id"] = session.id;
  const size_t written = serializeJson(document, file);
  const size_t newlineWritten = file.print('\n');
  file.flush();
  const bool persisted = written > 0 && newlineWritten == 1 && !file.getWriteError();
  file.close();
  if (!persisted) Serial.println("LittleFS attendance record write failed.");
  return persisted;
}

void loadPendingRecords() {
  if (!LittleFS.exists(kBatchPath)) return;
  File file = LittleFS.open(kBatchPath, FILE_READ);
  if (!file) {
    Serial.println("Could not open persisted attendance batch.");
    return;
  }
  while (file.available()) {
    String line = file.readStringUntil('\n');
    JsonDocument document;
    if (deserializeJson(document, line)) {
      Serial.println("Skipping a malformed persisted attendance record.");
      continue;
    }
    AttendanceRecord record;
    record.rollId = document["student_roll_id"] | 0U;
    record.rssi = document["rssi"] | -127;
    record.proof = String(document["proof"] | "");
    record.nonce = String(document["session_nonce"] | "");
    if (record.rollId && record.rssi >= kDefaultRssiThreshold) {
      auto current = records.find(record.rollId);
      if (current == records.end() || record.rssi > current->second.rssi) {
        records[record.rollId] = record;
      }
    }
  }
  file.close();
}

bool hasPendingRecords() {
  xSemaphoreTake(recordsMutex, portMAX_DELAY);
  const bool pending = !records.empty();
  xSemaphoreGive(recordsMutex);
  return pending;
}

void loadPendingSession() {
  if (!LittleFS.exists(kSessionPath)) return;
  File file = LittleFS.open(kSessionPath, FILE_READ);
  if (!file) {
    Serial.println("Could not read the persisted session metadata.");
    return;
  }
  JsonDocument document;
  if (deserializeJson(document, file)) {
    file.close();
    Serial.println("Persisted session metadata is invalid.");
    return;
  }
  session.id = String(document["session_id"] | "");
  session.nonce = String(document["session_nonce"] | "");
  session.serviceUuid = String(document["service_uuid"] | "");
  session.batchId = String(document["batch_id"] | "");
  session.offlineSessionJson = String(document["offline_session_json"] | "");
  session.facultyKeyId = String(document["faculty_key_id"] | "");
  session.facultySignature = String(document["faculty_signature"] | "");
  session.expiresAt = document["expires_at"] | 0U;
  session.locationId = document["location_id"] | 0U;
  session.durationSeconds = document["duration_seconds"] | 0U;
  decodeHex(session.nonce, session.nonceBytes, sizeof(session.nonceBytes));
  file.close();
}

bool buildSessionAdvertisement() {
  if (!session.active) return false;
  uint8_t key[32];
  if (!signingKey(key)) return false;
  uint8_t packet[16] = {
      0x56, 0x4e,
      static_cast<uint8_t>(session.locationId >> 8),
      static_cast<uint8_t>(session.locationId),
      session.nonceBytes[0], session.nonceBytes[1],
      session.nonceBytes[2], session.nonceBytes[3],
      static_cast<uint8_t>(session.expiresAt >> 24),
      static_cast<uint8_t>(session.expiresAt >> 16),
      static_cast<uint8_t>(session.expiresAt >> 8),
      static_cast<uint8_t>(session.expiresAt),
      0, 0, 0, 0};
  uint8_t digest[32];
  if (!hmacSha256(key, sizeof(key), packet, 12, digest)) return false;
  memcpy(packet + 12, digest, 4);
  const String expectedServiceUuid = formatUuid(packet);
  NimBLEAdvertisementData data;
  data.setFlags(0x06);
  data.addServiceUUID(NimBLEUUID(expectedServiceUuid.c_str()));
  advertising->stop();
  advertising->setAdvertisementData(data);
  advertising->setMinInterval(kAdvertiseInterval);
  advertising->setMaxInterval(kAdvertiseInterval);
  const bool started = advertising->start();
  if (started) session.serviceUuid = expectedServiceUuid;
  memset(key, 0, sizeof(key));
  memset(digest, 0, sizeof(digest));
  return started;
}

class AttendanceScanCallbacks final : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice *device) override {
    if (!session.active || device == nullptr || !device->haveServiceUUID()) return;
    const String uuid = String(device->getServiceUUID().toString().c_str());
    String compact = uuid;
    compact.replace("-", "");
    compact.toLowerCase();
    if (compact.length() != 32 || compact.substring(0, 4) != "564f") return;
    uint8_t bytes[16];
    if (!decodeHex(compact, bytes, sizeof(bytes))) return;
    if (bytes[2] != session.nonceBytes[0] || bytes[3] != session.nonceBytes[1]) return;
    const uint32_t rollId = (static_cast<uint32_t>(bytes[4]) << 24)
        | (static_cast<uint32_t>(bytes[5]) << 16)
        | (static_cast<uint32_t>(bytes[6]) << 8)
        | static_cast<uint32_t>(bytes[7]);
    const int rssi = device->getRSSI();
    if (rssi < kDefaultRssiThreshold) return;
    if (!rollId) return;
    xSemaphoreTake(recordsMutex, portMAX_DELAY);
    if (records.size() >= kMaxStudents && records.find(rollId) == records.end()) {
      xSemaphoreGive(recordsMutex);
      return;
    }
    auto found = records.find(rollId);
    if (found != records.end() && found->second.rssi >= rssi) {
      xSemaphoreGive(recordsMutex);
      return;
    }
    AttendanceRecord record;
    record.rollId = rollId;
    record.rssi = rssi;
    record.proof = toHex(bytes + 8, 8);
    record.nonce = session.nonce;
    if (!persistRecord(record)) {
      persistenceHealthy = false;
      xSemaphoreGive(recordsMutex);
      return;
    }
    records[rollId] = record;
    xSemaphoreGive(recordsMutex);
  }
};

AttendanceScanCallbacks scanCallbacks;

void startBleSession() {
  if (!session.active || !buildSessionAdvertisement()) {
    Serial.println("Could not start the signed session advertisement.");
    return;
  }
  scanner->setScanCallbacks(&scanCallbacks, false);
  scanner->setActiveScan(false);
  scanner->setInterval(kScanInterval);
  scanner->setWindow(kScanWindow);
  scanner->setDuplicateFilter(false);
  if (!scanner->start(0, false, false)) {
    Serial.println("Could not start passive BLE scanning.");
  }
}

void stopBleSession() {
  if (scanner) scanner->stop();
  if (advertising) advertising->stop();
  session.active = false;
  if (!hasPendingRecords()) LittleFS.remove(kSessionPath);
  Serial.println("Attendance capture stopped.");
}

void startSoftAp() {
  if (apEnabled) return;
  WiFi.mode(WIFI_AP_STA);
  const String ssid = String("Vidyut-Node-") + VIDYUT_NODE_ID;
  if (!WiFi.softAP(ssid.c_str(), VIDYUT_AP_PASSWORD)) {
    Serial.println("Could not start the faculty SoftAP.");
    return;
  }
  apEnabled = true;
  localServer.begin();
  Serial.print("Faculty SoftAP available: ");
  Serial.println(ssid);
}

void stopSoftAp() {
  localServer.stop();
  WiFi.softAPdisconnect(true);
  apEnabled = false;
  if (WiFi.status() == WL_CONNECTED) WiFi.mode(WIFI_STA);
  else WiFi.mode(WIFI_OFF);
}

bool verifyStartPayload(const JsonDocument &document) {
  String sessionId = String(document["session_id"] | "");
  String nonce = String(document["session_nonce"] | "");
  String uuid = String(document["service_uuid"] | "");
  uint32_t expiry = document["expires_at"] | 0U;
  uint16_t locationId = document["location_id"] | 0U;
  String signature = String(document["start_signature"] | "");
  uint32_t durationSeconds = document["duration_seconds"] | 0U;
  if (sessionId.isEmpty() || nonce.length() != 8 || uuid.length() != 36 || !expiry
      || durationSeconds == 0 || durationSeconds > 86400) return false;
  String message = sessionId + "|" + nonce + "|" + String(expiry) + "|"
      + String(locationId) + "|" + String(durationSeconds) + "|" + uuid;
  uint8_t key[32], digest[32], supplied[32];
  if (!signingKey(key) || !decodeHex(signature, supplied, sizeof(supplied))) return false;
  if (!hmacSha256(key, sizeof(key), reinterpret_cast<const uint8_t *>(message.c_str()),
                  message.length(), digest)) return false;
  const bool valid = constantTimeEqual(digest, supplied, sizeof(digest));
  memset(key, 0, sizeof(key));
  memset(digest, 0, sizeof(digest));
  memset(supplied, 0, sizeof(supplied));
  return valid;
}

void handleStartSession() {
  if (!localServer.hasArg("plain")) {
    localServer.send(400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }
  JsonDocument document;
  if (deserializeJson(document, localServer.arg("plain"))) {
    localServer.send(400, "application/json", "{\"error\":\"invalid session JSON\"}");
    return;
  }
  session.offlineSessionJson = String(document["offline_session_json"] | "");
  session.facultyKeyId = String(document["faculty_key_id"] | "");
  session.facultySignature = String(document["faculty_signature"] | "");
  const bool offlineSigned = !session.offlineSessionJson.isEmpty();
  JsonDocument signedSession;
  if (offlineSigned) {
    if (session.facultyKeyId.isEmpty() || session.facultySignature.isEmpty()
        || deserializeJson(signedSession, session.offlineSessionJson)) {
      localServer.send(403, "application/json", "{\"error\":\"offline session signature package is incomplete\"}");
      return;
    }
    if (String(signedSession["beacon_id"] | "") != VIDYUT_BEACON_ID) {
      localServer.send(403, "application/json", "{\"error\":\"signed session targets another attendance beacon\"}");
      return;
    }
    session.id = String(signedSession["session_id"] | "");
    session.nonce = String(signedSession["session_nonce"] | "");
    session.expiresAt = signedSession["expires_at_epoch"] | 0U;
    session.locationId = signedSession["location_id"] | 0U;
    session.durationSeconds = signedSession["duration_seconds"] | 0U;
    if (String(document["session_id"] | "") != session.id
        || String(document["session_nonce"] | "") != session.nonce
        || (document["expires_at"] | 0U) != session.expiresAt
        || (document["location_id"] | 0U) != session.locationId
        || (document["duration_seconds"] | 0U) != session.durationSeconds) {
      localServer.send(403, "application/json", "{\"error\":\"offline session fields do not match the signed package\"}");
      return;
    }
  } else {
    if (!verifyStartPayload(document)) {
      localServer.send(403, "application/json", "{\"error\":\"invalid signed session payload\"}");
      return;
    }
    session.id = String(document["session_id"].as<const char *>());
    session.nonce = String(document["session_nonce"].as<const char *>());
    session.serviceUuid = String(document["service_uuid"].as<const char *>());
    session.expiresAt = document["expires_at"] | 0U;
    session.locationId = document["location_id"] | 0U;
    session.durationSeconds = document["duration_seconds"] | 0U;
  }
  if (!decodeHex(session.nonce, session.nonceBytes, sizeof(session.nonceBytes))
      || session.durationSeconds == 0 || session.durationSeconds > 86400) {
    localServer.send(422, "application/json", "{\"error\":\"invalid session duration or nonce\"}");
    return;
  }
  if (hasPendingRecords()) {
    localServer.send(409, "application/json", "{\"error\":\"export pending attendance before starting another session\"}");
    return;
  }
  session.active = true;
  const String signedUuid = offlineSigned ? String("") : String(document["service_uuid"] | "");
  if (!buildSessionAdvertisement() || (!offlineSigned && session.serviceUuid != signedUuid)) {
    session.active = false;
    advertising->stop();
    localServer.send(403, "application/json", "{\"error\":\"session advertisement signature mismatch\"}");
    return;
  }
  sessionStartedAt = millis();
  char randomSuffix[9];
  snprintf(randomSuffix, sizeof(randomSuffix), "%08lx",
           static_cast<unsigned long>(esp_random()));
  session.batchId = String("VNODE-") + VIDYUT_NODE_ID + "-" + randomSuffix;
  document["batch_id"] = session.batchId;
  File sessionFile = LittleFS.open(kSessionPath, FILE_WRITE);
  if (!sessionFile) {
    session.active = false;
    advertising->stop();
    localServer.send(500, "application/json", "{\"error\":\"could not persist session metadata\"}");
    return;
  }
  const size_t written = serializeJson(document, sessionFile);
  sessionFile.flush();
  const bool saved = written > 0 && !sessionFile.getWriteError();
  sessionFile.close();
  if (!saved) {
    session.active = false;
    advertising->stop();
    LittleFS.remove(kSessionPath);
    localServer.send(500, "application/json", "{\"error\":\"could not persist session metadata\"}");
    return;
  }
  JsonDocument started;
  started["success"] = true;
  started["service_uuid"] = session.serviceUuid;
  localServer.send(200, "application/json", started.as<String>());
  stopSoftAp();
  startBleSession();
}

void handleExportBatch() {
  const String rawRecords = serializeRecords();
  uint8_t key[32], digest[32];
  if (!signingKey(key) || !hmacSha256(
          key, sizeof(key), reinterpret_cast<const uint8_t *>(rawRecords.c_str()),
          rawRecords.length(), digest)) {
    localServer.send(500, "application/json", "{\"error\":\"could not sign attendance batch\"}");
    return;
  }
  JsonDocument response;
  response["session_id"] = session.id;
  response["batch_id"] = session.batchId;
  response["beacon_id"] = VIDYUT_BEACON_ID;
  response["offline_session_json"] = session.offlineSessionJson;
  response["faculty_key_id"] = session.facultyKeyId;
  response["faculty_signature"] = session.facultySignature;
  response["raw_records_json"] = rawRecords;
  response["esp32_batch_signature"] = toHex(digest, sizeof(digest));
  String output;
  serializeJson(response, output);
  localServer.send(200, "application/json", output);
  memset(key, 0, sizeof(key));
  memset(digest, 0, sizeof(digest));
}

void handleAckBatch() {
  if (session.active) {
    localServer.send(409, "application/json", "{\"error\":\"stop attendance capture before acknowledging the batch\"}");
    return;
  }
  if (!localServer.hasArg("plain")) {
    localServer.send(400, "application/json", "{\"error\":\"missing batch acknowledgement\"}");
    return;
  }
  JsonDocument body;
  if (deserializeJson(body, localServer.arg("plain"))
      || String(body["batch_id"] | "") != session.batchId) {
    localServer.send(409, "application/json", "{\"error\":\"batch acknowledgement does not match\"}");
    return;
  }
  xSemaphoreTake(recordsMutex, portMAX_DELAY);
  records.clear();
  const bool batchRemoved = !LittleFS.exists(kBatchPath) || LittleFS.remove(kBatchPath);
  xSemaphoreGive(recordsMutex);
  if (!batchRemoved) {
    localServer.send(500, "application/json", "{\"error\":\"could not clear the imported batch\"}");
    return;
  }
  LittleFS.remove(kSessionPath);
  session.id.clear();
  session.nonce.clear();
  session.serviceUuid.clear();
  session.batchId.clear();
  session.offlineSessionJson.clear();
  session.facultyKeyId.clear();
  session.facultySignature.clear();
  localServer.send(200, "application/json", "{\"success\":true}");
}

void setupLocalRoutes() {
  localServer.on("/offline/start-session", HTTP_POST, handleStartSession);
  localServer.on("/offline/export-batch", HTTP_GET, handleExportBatch);
  localServer.on("/offline/ack-batch", HTTP_POST, handleAckBatch);
  localServer.on("/offline/stop-session", HTTP_POST, []() {
    stopBleSession();
    startSoftAp();
    localServer.send(200, "application/json", "{\"success\":true}");
  });
  localServer.onNotFound([]() {
    localServer.send(404, "application/json", "{\"error\":\"not found\"}");
  });
}

bool uploadBatch() {
  if (WiFi.status() != WL_CONNECTED || !hasPendingRecords()
      || session.id.isEmpty() || session.batchId.isEmpty()
      || !session.offlineSessionJson.isEmpty()
      || String(VIDYUT_API_ROOT_CA).isEmpty()) return false;
  const String rawRecords = serializeRecords();
  uint8_t key[32], digest[32];
  if (!signingKey(key) || !hmacSha256(
          key, sizeof(key), reinterpret_cast<const uint8_t *>(rawRecords.c_str()),
          rawRecords.length(), digest)) return false;
  JsonDocument payload;
  payload["batch_id"] = session.batchId;
  payload["session_id"] = session.id;
  payload["beacon_id"] = VIDYUT_BEACON_ID;
  payload["raw_records_json"] = rawRecords;
  payload["esp32_batch_signature"] = toHex(digest, sizeof(digest));
  String body;
  serializeJson(payload, body);

  WiFiClientSecure tls;
  tls.setCACert(VIDYUT_API_ROOT_CA);
  HTTPClient http;
  const String url = String(VIDYUT_API_BASE_URL) + "/api/attendance/esp32-batch";
  if (!http.begin(tls, url)) {
    Serial.println("Could not initialize the attendance API connection.");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Campus-Domain", VIDYUT_TENANT_DOMAIN);
  const int status = http.POST(body);
  const bool uploaded = status >= 200 && status < 300;
  if (status < 0) Serial.printf("Attendance API upload failed: %s\n", http.errorToString(status).c_str());
  else if (!uploaded) Serial.printf("Attendance API returned HTTP %d.\n", status);
  http.end();
  memset(key, 0, sizeof(key));
  memset(digest, 0, sizeof(digest));
  if (uploaded) {
    xSemaphoreTake(recordsMutex, portMAX_DELAY);
    records.clear();
    LittleFS.remove(kBatchPath);
    xSemaphoreGive(recordsMutex);
    if (!session.active) LittleFS.remove(kSessionPath);
  }
  return uploaded;
}

void connectCampusWifi() {
  if (String(VIDYUT_WIFI_SSID).isEmpty() || String(VIDYUT_WIFI_SSID) == "replace-me") return;
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(VIDYUT_WIFI_SSID, VIDYUT_WIFI_PASSWORD);
  for (uint8_t attempt = 0; attempt < 3; ++attempt) {
    const unsigned long deadline = millis() + 10000;
    while (WiFi.status() != WL_CONNECTED && millis() < deadline) delay(100);
    if (WiFi.status() == WL_CONNECTED) {
      wifiFailures = 0;
      return;
    }
    ++wifiFailures;
    WiFi.disconnect();
    delay(500);
    WiFi.begin(VIDYUT_WIFI_SSID, VIDYUT_WIFI_PASSWORD);
  }
}
}  // namespace

void setup() {
  Serial.begin(115200);
  if (!safeConfig()) return;
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed; attendance is disabled.");
    return;
  }
  loadPendingRecords();
  loadPendingSession();
  recordsMutex = xSemaphoreCreateMutex();
  if (recordsMutex == nullptr) {
    Serial.println("Could not initialize the attendance data lock.");
    return;
  }
  NimBLEDevice::init(String(VIDYUT_NODE_ID).c_str());
  advertising = NimBLEDevice::getAdvertising();
  scanner = NimBLEDevice::getScan();
  connectCampusWifi();
  setupLocalRoutes();
  startSoftAp();
  initialized = true;
}

void loop() {
  if (!initialized) {
    delay(1000);
    return;
  }
  if (!persistenceHealthy && session.active) {
    stopBleSession();
    startSoftAp();
  }
  if (apEnabled) localServer.handleClient();
  if (session.active && session.durationSeconds
      && millis() - sessionStartedAt >= session.durationSeconds * 1000UL) {
    stopBleSession();
    startSoftAp();
  }
  if (hasPendingRecords() && millis() - lastUploadAt >= kUploadIntervalMs) {
    lastUploadAt = millis();
    uploadBatch();
  }
  if (WiFi.status() != WL_CONNECTED && String(VIDYUT_WIFI_SSID) != "replace-me") {
    const unsigned long now = millis();
    if (wifiFailures >= 3 && now - lastReconnectAt >= 60000) {
      wifiFailures = 0;
      lastReconnectAt = now;
    } else if (wifiFailures < 3 && now - lastReconnectAt >= 15000) {
      lastReconnectAt = now;
      WiFi.begin(VIDYUT_WIFI_SSID, VIDYUT_WIFI_PASSWORD);
      if (WiFi.waitForConnectResult() == WL_CONNECTED) wifiFailures = 0;
      else ++wifiFailures;
    }
  }
  delay(5);
}
