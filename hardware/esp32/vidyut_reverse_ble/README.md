# Reverse BLE attendance node

This PlatformIO target is an ESP32-S3 Arduino firmware for the reverse-BLE attendance flow. It broadcasts the signed 16-byte session value as a 128-bit service UUID, passively scans for student UUIDs, retains the peak RSSI for up to 150 numeric roll IDs, and appends every capture to LittleFS before upload/export.

## Provisioning and build

1. Copy `include/secrets.h.example` to `include/secrets.h` and set the node ID, attendance beacon ID, tenant domain, campus Wi-Fi credentials, SoftAP password, and the beacon signing secret provisioned for this node. Keep `secrets.h` out of source control.
2. Set `VIDYUT_API_ROOT_CA` to the campus API trust root. Cloud uploads fail closed if this is empty; do not replace certificate validation with `setInsecure()`.
3. Build and flash with PlatformIO from this directory. NimBLE-Arduino 2.3.x and ArduinoJson 7 are declared in `platformio.ini`.
4. While online, Faculty registers its hardware-backed offline signing key and caches the authorized roster. For an existing online session, the app fetches `GET /api/attendance/sessions/{id}/ble`; for a new offline session, it signs the session and roster package with the registered key. The app POSTs the appropriate start payload to `http://192.168.4.1/offline/start-session` while connected to `Vidyut-Node-<ID>`.
5. Session capture stops at the supplied duration. `GET /offline/export-batch` returns `raw_records_json`, `batch_id`, and the ESP32 HMAC signature for delayed `POST /api/attendance/faculty-offline-sync`. The backend verifies the Faculty signature and reconciles the offline session and captured records.

The node retries campus Wi-Fi and uses a password-protected SoftAP for Faculty setup/export. During a capture session the SoftAP is disabled; when the node has no STA connection it disables Wi-Fi and uses the radio for BLE. Fully offline session creation requires the Faculty signing key and roster to have been cached before the outage. The backend checks that the signing key remains authorized and that roster members are still eligible when the batch is synced. On reboot, persisted records and session metadata are recovered for export or upload, but an interrupted capture is not resumed.

## Security and operational limits

The Student app can read the active nonce from BLE or the Faculty QR. Android performs local face liveness and advertises a five-second HMAC proof using the key wrapped to Android Keystore during passkey/face enrollment; the raw HMAC key is not returned to JavaScript. Online, iOS verifies the passkey and face with the backend, receives a one-time eight-byte token, and advertises the 128-bit service UUID through CoreBluetooth while the app remains in the foreground. Offline, iOS saves the Faculty QR and queues a session-bound passkey assertion; after reconnecting it repeats face liveness and submits the assertion and fresh embedding to `POST /api/attendance/student-offline-sync`. The face embedding is not persisted on the phone. The firmware does not know individual student secrets; the backend validates each proof before recording attendance.

The online iOS token is issued by `POST /api/attendance/sessions/{session_id}/ios-ble-token` only after the backend validates the student passkey and face. It is valid for at most 90 seconds (or the remaining session lifetime) and is consumed by the first accepted ESP32 batch record.

The 4-byte session signature and 8-byte student MAC are compact protocol fields, not strong anti-relay proofs. The iOS token is a short-lived, single-use proximity credential, not an anti-relay proof. RSSI is a proximity heuristic, and a live BLE relay can forward the packets. Protect the node signing secret with ESP32 secure boot and flash encryption in production, provision each node uniquely, and rotate a key after device loss. iOS advertising stops when the app leaves the foreground; its QR/passkey fallback is used when offline.

Offline sessions are reconciled on the server when Faculty uploads the signed ESP32 batch. Students can complete the iOS passkey/face fallback for up to seven days after the session expires, once that reconciliation has completed.

The Faculty key enrollment and ESP32 SoftAP transport use the Android native bridge in this build. iOS supports the Student QR/passkey fallback, but does not yet act as the Faculty gateway for starting or exporting ESP32 sessions.
