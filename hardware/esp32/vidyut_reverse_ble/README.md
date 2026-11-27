# Online Reverse BLE attendance node

This PlatformIO target runs on an ESP32-S3 with campus 2.4 GHz Wi-Fi and NimBLE-Arduino. Faculty or Wardens create sessions online. The node polls the backend for the active session assigned to its beacon, passively scans student `0x564F` service UUIDs, and submits signed attendance batches over HTTPS.

## Build and flash the firmware once

From this directory, install PlatformIO Core and run:

```text
pio run -e esp32-s3-devkitc-1
pio run -e esp32-s3-devkitc-1 -t upload
```

`include/secrets.h` is optional. The firmware checks for it with `__has_include` and builds without it; `include/secrets.h.example` documents the optional compile-time fallback. Normal provisioning stores all eight settings (`node_id`, `beacon_id`, `signing_secret`, `tenant_domain`, `wifi_ssid`, `wifi_password`, `api_base_url`, and `root_ca_pem`) in ESP32 NVS using `Preferences`. NVS survives restarts and loss of power.

## Provision future boards from Beacon Manager

After flashing the firmware once, provision every board directly from the signed-in Beacon Manager portal. No source edits, VS Code, or C++ rebuild are needed for later boards.

1. Open the portal using Chrome or Edge over HTTPS (Web Serial requires a secure context; `localhost` is also supported).
2. Enter the campus 2.4 GHz Wi-Fi SSID/password and the HTTPS API base URL in **USB provisioning network settings**, then click **Save Wi-Fi settings**. They are retained in that browser's local storage. The tenant domain comes from the signed-in campus portal.
3. Create a beacon to reveal its one-time signing secret, or use the USB action on an existing beacon. If its one-time secret is no longer available, that action rotates its key first; key rotation is blocked while attendance sessions are open.
4. Connect the ESP32 by USB, click **Provision ESP32 via USB**, and select its serial/COM port. The portal sends a newline-terminated JSON payload at 115200 baud containing the beacon identity, key, Wi-Fi/API settings, and ISRG Root X1 certificate. The board validates it, saves it to NVS, replies with a JSON `OK`, and reboots into online mode.

The firmware keeps the USB serial provisioning listener active while starting Wi-Fi and synchronizing time. Invalid JSON or configuration is rejected and does not replace the saved configuration. Keep the one-time signing key and Wi-Fi password private. Use the USB flow only from a trusted workstation/browser profile; the Wi-Fi password is stored in that browser's local storage. For production, enable ESP32 secure boot and flash encryption.

## Online operation

- The node uses STA Wi-Fi only. It synchronizes its clock with NTP, then requests `GET /api/attendance/esp32-active-session?beacon_id=<id>` over HTTPS every five seconds.
- Poll requests include `X-Campus-Domain`, a Unix timestamp, and an HMAC-SHA256 signature of `beacon_id|timestamp` using the provisioned beacon secret. The backend accepts only timestamps within 60 seconds and returns only a session assigned to this beacon. Multiple matching sessions are reported as a conflict; the firmware stops capture rather than choosing one.
- While a session is active, the node passively scans with an 80 ms window and 160 ms interval. It accepts student `0x564F` packets with the active nonce prefix and server-configured RSSI threshold, retaining each student's strongest RSSI in RAM (up to 150 students).
- The node signs and uploads captured records to `POST /api/attendance/esp32-batch` every three seconds. Successful uploads remove those records from RAM. A Wi-Fi or API outage stops scanning and clears unsubmitted records; no queue, SoftAP, local HTTP server, or flash persistence is provided for attendance records.

## Limitations

The backend verifies each student's hardware-backed BLE HMAC against their enrolled device secret, checks the session nonce and configured RSSI threshold, preserves manual overrides, and deduplicates records across beacons. RSSI is a proximity heuristic, not relay protection. Keep beacon signing keys unique, restrict physical access to devices, and rotate credentials if a node is lost or compromised.
