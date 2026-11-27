# Vidyut OS ESP32 beacon

This firmware broadcasts a rotating, signed iBeacon identifier. The attendance server validates the identifier against a Beacon Manager-provisioned key. The beacon itself does not connect to Vidyut OS or submit attendance.

## Provisioning

1. In Vidyut OS, create the beacon in Beacon Manager and keep the one-time **Beacon code** and **Signing secret** available.
2. Install Arduino IDE, the ESP32 Arduino board package, and **NimBLE-Arduino** by h2zero.
3. Open `vidyut_beacon.ino`. Set the campus Wi-Fi SSID/password, `BEACON_CODE`, and `SIGNING_SECRET_HEX`. The code is 8 hexadecimal characters; the secret is 64 hexadecimal characters.
4. Flash the sketch to an ESP32 with BLE support and monitor its serial output. It does not advertise until Wi-Fi and NTP time synchronization succeed.
5. Confirm the beacon is active and provisioned in Beacon Manager. Store the signing secret privately; never put real campus credentials or provisioning values in source control.

The Wi-Fi connection is used only for initial clock synchronization and keeping the clock current. The ESP32 does not need a Vidyut OS API token. If Wi-Fi/time synchronization fails, the beacon fails closed and does not advertise.

## On-air format

- Standard iBeacon manufacturer advertisement (`Apple` company identifier `0x004C`, iBeacon type `0x0215`).
- The 16-byte UUID comprises the 4-byte beacon code, a 4-byte big-endian 30-second Unix time slot, and the first 8 bytes of HMAC-SHA256.
- HMAC input is the uppercase 8-character beacon code, a colon, and the decimal time-slot number. The key is the 32-byte signing secret.
- Major/minor are fixed at `1`; RSSI is measured by the student device and checked against the configured threshold.

Rotating identifiers prevent a captured static identifier from being replayed later. They do **not** prevent a live BLE relay or guarantee physical proximity. A signing key extracted from a physically accessed ESP32 can be used to clone its beacon. Use supervised installation, configure ESP32 secure boot and flash encryption for production, rotate exposed keys immediately, and treat RSSI as a proximity signal, not distance proof.

## Replacing or rotating a device

In Beacon Manager, rotate the key, then update and reflash the ESP32 with the newly displayed one-time code and secret. Close active attendance sessions first. Renaming a beacon's Vidyut OS display label does not change its radio identity and does not require reflashing.
