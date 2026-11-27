#include <NimBLEDevice.h>
#include <WiFi.h>
#include <cstdio>
#include <cstring>
#include <mbedtls/md.h>
#include <string>
#include <time.h>

// Configure per device. The backend displays these values once when a beacon
// is created or its signing key is rotated.
static const char *WIFI_SSID = "REPLACE_WITH_CAMPUS_WIFI";
static const char *WIFI_PASSWORD = "REPLACE_WITH_WIFI_PASSWORD";
static const char *BEACON_CODE = "00000000";
static const char *SIGNING_SECRET_HEX =
    "0000000000000000000000000000000000000000000000000000000000000000";

static constexpr uint32_t ROTATION_SECONDS = 30;
static constexpr size_t SIGNING_SECRET_BYTES = 32;
static constexpr size_t SIGNATURE_BYTES = 8;

static uint8_t signingSecret[SIGNING_SECRET_BYTES];
static NimBLEAdvertising *advertising;
static uint32_t advertisedSlot = 0;

static int hexValue(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  return -1;
}

static bool decodeHex(const char *text, uint8_t *output, size_t outputLength) {
  if (strlen(text) != outputLength * 2) return false;
  for (size_t i = 0; i < outputLength; ++i) {
    const int high = hexValue(text[i * 2]);
    const int low = hexValue(text[i * 2 + 1]);
    if (high < 0 || low < 0) return false;
    output[i] = static_cast<uint8_t>((high << 4) | low);
  }
  return true;
}

static bool buildIBeaconAdvertisement(uint32_t slot) {
  uint8_t code[4];
  if (!decodeHex(BEACON_CODE, code, sizeof(code))) return false;

  char message[32];
  const int messageLength = snprintf(
      message, sizeof(message), "%s:%lu", BEACON_CODE, static_cast<unsigned long>(slot));
  uint8_t digest[32];
  const mbedtls_md_info_t *mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!mdInfo || mbedtls_md_hmac(
                     mdInfo, signingSecret, sizeof(signingSecret),
                     reinterpret_cast<const unsigned char *>(message),
                     static_cast<size_t>(messageLength), digest) != 0) {
    return false;
  }

  uint8_t rotatingUuid[16];
  memcpy(rotatingUuid, code, sizeof(code));
  rotatingUuid[4] = static_cast<uint8_t>(slot >> 24);
  rotatingUuid[5] = static_cast<uint8_t>(slot >> 16);
  rotatingUuid[6] = static_cast<uint8_t>(slot >> 8);
  rotatingUuid[7] = static_cast<uint8_t>(slot);
  memcpy(rotatingUuid + 8, digest, SIGNATURE_BYTES);

  uint8_t manufacturerData[25] = {
      0x4c, 0x00, 0x02, 0x15,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0x00, 0x01, 0x00, 0x01, 0xc5};
  memcpy(manufacturerData + 4, rotatingUuid, sizeof(rotatingUuid));

  NimBLEAdvertisementData data;
  data.setFlags(0x06);
  data.setManufacturerData(std::string(
      reinterpret_cast<const char *>(manufacturerData), sizeof(manufacturerData)));
  advertising->stop();
  advertising->setAdvertisementData(data);
  return advertising->start();
}

void setup() {
  Serial.begin(115200);
  if (strcmp(WIFI_SSID, "REPLACE_WITH_CAMPUS_WIFI") == 0 ||
      strcmp(WIFI_PASSWORD, "REPLACE_WITH_WIFI_PASSWORD") == 0 ||
      !decodeHex(SIGNING_SECRET_HEX, signingSecret, sizeof(signingSecret))) {
    Serial.println("Configure Wi-Fi and the one-time signing secret; beacon remains disabled.");
    return;
  }
  bool secretConfigured = false;
  for (uint8_t byte : signingSecret) {
    secretConfigured = secretConfigured || byte != 0;
  }
  if (!secretConfigured || strcmp(BEACON_CODE, "00000000") == 0) {
    Serial.println("Replace the placeholder beacon code and secret; beacon remains disabled.");
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long deadline = millis() + 30000;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
    delay(250);
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Campus Wi-Fi is required to synchronize beacon time.");
    return;
  }

  configTime(0, 0, "pool.ntp.org", "time.google.com");
  time_t now = 0;
  const unsigned long timeDeadline = millis() + 30000;
  while (now < 1700000000 && millis() < timeDeadline) {
    delay(250);
    time(&now);
  }
  if (now < 1700000000) {
    Serial.println("Time synchronization failed; beacon remains disabled.");
    return;
  }

  NimBLEDevice::init("");
  advertising = NimBLEDevice::getAdvertising();
  advertisedSlot = static_cast<uint32_t>(now / ROTATION_SECONDS);
  if (!buildIBeaconAdvertisement(advertisedSlot)) {
    Serial.println("Could not start the signed BLE advertisement.");
  }
}

void loop() {
  if (advertising == nullptr) {
    delay(1000);
    return;
  }

  time_t now = 0;
  time(&now);
  const uint32_t slot = static_cast<uint32_t>(now / ROTATION_SECONDS);
  if (now >= 1700000000 && slot != advertisedSlot) {
    advertisedSlot = slot;
    if (!buildIBeaconAdvertisement(slot)) {
      Serial.println("Could not refresh the signed BLE advertisement.");
    }
  }
  delay(250);
}
