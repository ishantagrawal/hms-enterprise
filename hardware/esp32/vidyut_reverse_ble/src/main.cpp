#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <mbedtls/md.h>
#include <map>
#include <time.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define VIDYUT_NODE_ID ""
#define VIDYUT_BEACON_ID ""
#define VIDYUT_TENANT_DOMAIN ""
#define VIDYUT_API_BASE_URL ""
#define VIDYUT_WIFI_SSID ""
#define VIDYUT_WIFI_PASSWORD ""
#define VIDYUT_SIGNING_SECRET_HEX ""
#define VIDYUT_API_ROOT_CA ""
#endif

namespace {
constexpr uint32_t kScanInterval = 160;
constexpr uint32_t kScanWindow = 80;
constexpr uint32_t kSessionPollIntervalMs = 5000;
constexpr uint32_t kUploadIntervalMs = 3000;
constexpr uint32_t kReconnectIntervalMs = 15000;
constexpr size_t kMaxStudents = 150;
constexpr int8_t kDefaultRssiThreshold = -78;
constexpr size_t kMaxProvisioningPayload = 8192;
constexpr char kDefaultRootCaPem[] = R"PEM(-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)PEM";

struct DeviceConfig {
  String nodeId = VIDYUT_NODE_ID;
  String beaconId = VIDYUT_BEACON_ID;
  String signingSecret = VIDYUT_SIGNING_SECRET_HEX;
  String tenantDomain = VIDYUT_TENANT_DOMAIN;
  String wifiSsid = VIDYUT_WIFI_SSID;
  String wifiPassword = VIDYUT_WIFI_PASSWORD;
  String apiBaseUrl = VIDYUT_API_BASE_URL;
  String rootCaPem = VIDYUT_API_ROOT_CA[0] != '\0'
      ? VIDYUT_API_ROOT_CA : kDefaultRootCaPem;
};

DeviceConfig config;

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

bool loadConfig() {
  Preferences preferences;
  if (!preferences.begin("vidyut", true)) return false;
  if (preferences.getBool("configured", false)) {
    config.nodeId = preferences.getString("node_id", config.nodeId);
    config.beaconId = preferences.getString("beacon_id", config.beaconId);
    config.signingSecret = preferences.getString("signing_secret", config.signingSecret);
    config.tenantDomain = preferences.getString("tenant_domain", config.tenantDomain);
    config.wifiSsid = preferences.getString("wifi_ssid", config.wifiSsid);
    config.wifiPassword = preferences.getString("wifi_password", config.wifiPassword);
    config.apiBaseUrl = preferences.getString("api_base_url", config.apiBaseUrl);
    config.rootCaPem = preferences.getString("root_ca_pem", "");
    if (config.rootCaPem.isEmpty()) config.rootCaPem = kDefaultRootCaPem;
  }
  preferences.end();
  return true;
}

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
  return decodeHex(config.signingSecret, key, 32);
}

bool safeConfig() {
  if (config.nodeId.isEmpty() || config.beaconId.length() < 4
      || config.tenantDomain.isEmpty() || config.wifiSsid.isEmpty()
      || config.apiBaseUrl.indexOf("https://") != 0
      || config.apiBaseUrl.length() <= 8
      || config.rootCaPem.isEmpty() || config.signingSecret.length() != 64) {
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

bool validProvisioningConfig(const JsonDocument &document, DeviceConfig &provisioned) {
  if (document["cmd"] != "PROVISION") return false;
  provisioned.nodeId = String(document["node_id"] | "");
  provisioned.beaconId = String(document["beacon_id"] | "");
  provisioned.signingSecret = String(document["signing_secret"] | "");
  provisioned.tenantDomain = String(document["tenant_domain"] | "");
  provisioned.wifiSsid = String(document["wifi_ssid"] | "");
  provisioned.wifiPassword = String(document["wifi_password"] | "");
  provisioned.apiBaseUrl = String(document["api_base_url"] | "");
  provisioned.rootCaPem = String(document["root_ca_pem"] | "");
  if (provisioned.rootCaPem.isEmpty()) provisioned.rootCaPem = kDefaultRootCaPem;

  uint8_t key[32];
  const bool valid = !provisioned.nodeId.isEmpty() && provisioned.nodeId.length() <= 64
      && provisioned.beaconId.length() >= 4 && provisioned.beaconId.length() <= 100
      && provisioned.tenantDomain.length() <= 253 && !provisioned.tenantDomain.isEmpty()
      && provisioned.tenantDomain.indexOf('/') < 0
      && provisioned.tenantDomain.indexOf(' ') < 0
      && provisioned.wifiSsid.length() <= 32 && !provisioned.wifiSsid.isEmpty()
      && provisioned.wifiPassword.length() <= 64
      && provisioned.apiBaseUrl.length() <= 256
      && provisioned.apiBaseUrl.indexOf("https://") == 0
      && provisioned.apiBaseUrl.substring(8).indexOf('/') < 0
      && provisioned.apiBaseUrl.substring(8).indexOf(' ') < 0
      && provisioned.apiBaseUrl.substring(8).indexOf('?') < 0
      && provisioned.rootCaPem.length() <= 4096
      && provisioned.rootCaPem.startsWith("-----BEGIN CERTIFICATE-----")
      && provisioned.rootCaPem.indexOf("-----END CERTIFICATE-----") >= 0
      && decodeHex(provisioned.signingSecret, key, sizeof(key));
  memset(key, 0, sizeof(key));
  return valid;
}

bool saveConfig(const DeviceConfig &provisioned) {
  Preferences preferences;
  if (!preferences.begin("vidyut", false)) return false;
  const bool invalidated = preferences.putBool("configured", false);
  const bool saved = invalidated && preferences.putString("node_id", provisioned.nodeId) > 0
      && preferences.putString("beacon_id", provisioned.beaconId) > 0
      && preferences.putString("signing_secret", provisioned.signingSecret) > 0
      && preferences.putString("tenant_domain", provisioned.tenantDomain) > 0
      && preferences.putString("wifi_ssid", provisioned.wifiSsid) > 0
      && preferences.putString("wifi_password", provisioned.wifiPassword) > 0
      && preferences.putString("api_base_url", provisioned.apiBaseUrl) > 0
      && preferences.putString("root_ca_pem", provisioned.rootCaPem) > 0;
  const bool markedConfigured = saved && preferences.putBool("configured", true);
  preferences.end();
  return markedConfigured;
}

void sendSerialStatus(const char *status, const String &beaconId = "",
                      const char *error = nullptr) {
  JsonDocument response;
  response["status"] = status;
  if (!beaconId.isEmpty()) response["beacon_id"] = beaconId;
  if (error) response["error"] = error;
  serializeJson(response, Serial);
  Serial.println();
}

bool processProvisioningPayload(const String &payload) {
  JsonDocument document;
  const DeserializationError parseError = deserializeJson(document, payload);
  if (parseError) {
    String error = "Invalid JSON payload: ";
    error += parseError.c_str();
    if (document.overflowed()) error += " (JSON document overflowed).";
    sendSerialStatus("ERROR", "", error.c_str());
    return false;
  }

  DeviceConfig provisioned;
  if (!validProvisioningConfig(document, provisioned)) {
    sendSerialStatus("ERROR", "", "Missing or invalid provisioning fields.");
    return false;
  }
  if (!saveConfig(provisioned)) {
    sendSerialStatus("ERROR", "", "Could not save configuration to NVS.");
    return false;
  }

  sendSerialStatus("OK", provisioned.beaconId);
  Serial.flush();
  delay(500);
  ESP.restart();
  return true;
}

void processSerialProvisioning() {
  static String payload;
  while (Serial.available()) {
    const char next = static_cast<char>(Serial.read());
    if (next == '\n') {
      payload.trim();
      if (!payload.isEmpty()) {
        const int jsonStart = payload.indexOf('{');
        const int jsonEnd = payload.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd >= jsonStart) {
          processProvisioningPayload(payload.substring(jsonStart, jsonEnd + 1));
        } else {
          processProvisioningPayload(payload);
        }
      }
      payload = "";
    } else if (payload.length() < kMaxProvisioningPayload) {
      payload += next;
    } else {
      payload = "";
      sendSerialStatus("ERROR", "", "Provisioning payload exceeds the size limit.");
    }
  }
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
  String base = config.apiBaseUrl;
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
  while (time(nullptr) < 1700000000 && millis() < deadline) {
    processSerialProvisioning();
    delay(10);
  }
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
  const String signedMessage = config.beaconId + "|" + timestamp;
  const bool signedOk = hmacSha256(
      key, sizeof(key),
      reinterpret_cast<const uint8_t *>(signedMessage.c_str()),
      signedMessage.length(), digest);
  memset(key, 0, sizeof(key));
  if (!signedOk) return false;

  WiFiClientSecure tls;
  tls.setCACert(config.rootCaPem.c_str());
  HTTPClient http;
  const String url = apiUrl("/api/attendance/esp32-active-session?beacon_id=")
      + encodeQueryValue(config.beaconId);
  if (!http.begin(tls, url)) {
    memset(digest, 0, sizeof(digest));
    Serial.println("Could not initialize the active-session API request.");
    return false;
  }
  http.addHeader("Accept", "application/json");
  http.addHeader("X-Campus-Domain", config.tenantDomain);
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
  return String("VNODE-") + config.nodeId + "-" + suffix;
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
  payload["beacon_id"] = config.beaconId;
  payload["raw_records_json"] = rawRecords;
  payload["esp32_batch_signature"] = toHex(digest, sizeof(digest));
  String body;
  serializeJson(payload, body);
  memset(key, 0, sizeof(key));
  memset(digest, 0, sizeof(digest));

  WiFiClientSecure tls;
  tls.setCACert(config.rootCaPem.c_str());
  HTTPClient http;
  if (!http.begin(tls, apiUrl("/api/attendance/esp32-batch"))) {
    Serial.println("Could not initialize the attendance batch upload.");
    resetSession();
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Campus-Domain", config.tenantDomain);
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
  WiFi.begin(config.wifiSsid.c_str(), config.wifiPassword.c_str());
  for (uint8_t attempt = 0; attempt < 3; ++attempt) {
    const unsigned long deadline = millis() + 10000;
    while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
      processSerialProvisioning();
      delay(10);
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("Connected to campus Wi-Fi.");
      processSerialProvisioning();
      syncClock();
      return;
    }
    WiFi.disconnect();
    for (uint8_t wait = 0; wait < 50; ++wait) {
      processSerialProvisioning();
      delay(10);
    }
    WiFi.begin(config.wifiSsid.c_str(), config.wifiPassword.c_str());
  }
  Serial.println("Campus Wi-Fi is unavailable; attendance scanning remains disabled.");
}
}  // namespace

void setup() {
  Serial.setRxBufferSize(4096);
  Serial.begin(115200);
  Serial.println("VIDYUT_BLE_READY");
  const unsigned long provisioningDeadline = millis() + 3000;
  while (millis() < provisioningDeadline) {
    processSerialProvisioning();
    delay(1);
  }
  processSerialProvisioning();

  if (!loadConfig()) {
    Serial.println("Could not read ESP32 NVS configuration.");
  }
  if (!safeConfig()) return;
  recordsMutex = xSemaphoreCreateMutex();
  if (recordsMutex == nullptr) {
    Serial.println("Could not initialize the attendance data lock.");
    return;
  }
  NimBLEDevice::init(config.nodeId.c_str());
  scanner = NimBLEDevice::getScan();
  scanner->setScanCallbacks(&scanCallbacks, false);
  connectCampusWifi();
  initialized = true;
}

void loop() {
  processSerialProvisioning();
  if (!initialized) {
    delay(10);
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
    processSerialProvisioning();
    syncClock();
  }
  if (time(nullptr) < 1700000000) {
    resetSession();
    delay(25);
    return;
  }
  if (now - lastPollAt >= kSessionPollIntervalMs) {
    processSerialProvisioning();
    lastPollAt = now;
    refreshActiveSession();
  }
  if (session.active && !scanning) startScanner();
  if (session.active && now - lastUploadAt >= kUploadIntervalMs) {
    processSerialProvisioning();
    lastUploadAt = now;
    uploadBatch();
  }
  delay(10);
}
