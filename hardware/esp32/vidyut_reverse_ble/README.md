# Online Reverse BLE attendance node

This PlatformIO target runs on an ESP32-S3 with campus Wi-Fi and NimBLE-Arduino. Faculty or Wardens create sessions online. The node polls the backend for the active session assigned to its beacon, passively scans student `0x564F` service UUIDs, and submits signed attendance batches over HTTPS.

## Provisioning and build

1. Copy `include/secrets.h.example` to `include/secrets.h`. Set a unique node ID, the attendance beacon ID from Beacon Manager, tenant domain, campus Wi-Fi credentials, API base URL, the beacon signing secret, and the trusted API root CA.
2. Keep `secrets.h` out of source control. The signing secret must match the one-time secret provisioned for that beacon. Store it securely and enable ESP32 secure boot and flash encryption in production.
3. Configure the API root CA as a PEM string. The firmware fails closed if TLS trust or required online configuration is missing; do not use `setInsecure()`.
4. Build and flash with PlatformIO from this directory. NimBLE-Arduino 2.3.x and ArduinoJson 7 are declared in `platformio.ini`.

## Online operation

- The node uses STA Wi-Fi only. It synchronizes its clock with NTP, then requests `GET /api/attendance/esp32-active-session?beacon_id=<id>` over HTTPS every five seconds.
- Poll requests include `X-Campus-Domain`, a Unix timestamp, and an HMAC-SHA256 signature of `beacon_id|timestamp` using the provisioned beacon secret. The backend accepts only timestamps within 60 seconds and returns only a session assigned to this beacon. Multiple matching sessions are reported as a conflict; the firmware stops capture rather than choosing one.
- While a session is active, the node passively scans with a 50 ms window and 100 ms interval. It accepts student `0x564F` packets with the active nonce prefix and server-configured RSSI threshold, retaining each student's strongest RSSI in RAM (up to 150 students).
- The node signs and uploads captured records to `POST /api/attendance/esp32-batch` every three seconds. Successful uploads remove those records from RAM. A Wi-Fi or API outage stops scanning and clears unsubmitted records; no queue, SoftAP, local HTTP server, or flash persistence is provided.

## Limitations

The backend verifies each student's hardware-backed BLE HMAC against their enrolled device secret, checks the session nonce and configured RSSI threshold, preserves manual overrides, and deduplicates records across beacons. RSSI is a proximity heuristic, not relay protection. Keep beacon signing keys unique, restrict physical access to devices, and rotate credentials if a node is lost or compromised.
