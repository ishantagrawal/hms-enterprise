# HMS Enterprise

## Sign-in and multi-college setup

Students sign in with Google Identity Services. Each college is configured
with one exact portal domain and one approved Google email domain. The backend
accepts verified email addresses at that domain or its subdomains (for example
`student@branch.example.edu`). New student accounts are created from the
verified email local part; students complete their college profile in the
portal. If that ID already exists with another approved college-domain email,
a verified branch-domain sign-in links the new address to the existing student
account instead of creating a duplicate.

Dean, Founder, Warden, club, and staff accounts sign in with their account ID
and an individual password. Passwords are stored as PBKDF2-HMAC-SHA256 hashes.
Students cannot use staff password login. Password access follows the college
hierarchy: the Founder manages only the Dean; the Dean manages Wardens, clubs,
gate security, and central staff; each Warden manages only staff accounts
created for that Warden's hostel. Passwords must be at least 12 characters.
Never share one password across accounts.

The current SVNIT tenant is seeded for migration compatibility. Additional
colleges can be configured by the Founder from the Founder portal when the
backend uses PostgreSQL. Tenant-owned rows are scoped by `college_id` and
PostgreSQL row-level security. Use a database role that does not have
`BYPASSRLS` or superuser privileges; otherwise PostgreSQL can bypass those
policies.

Configure these environment variables on the backend host:

- `GOOGLE_CLIENT_ID`: OAuth web client ID; defaults to the client ID configured
  for this project.
- `FACE_ENCRYPTION_KEY`: stable Fernet key used to encrypt face enrollment
  references in the database. Generate one with Python's
  `Fernet.generate_key()` and keep it outside source control. Preserve the same
  key across deployments and backups; losing or rotating it makes stored
  references unreadable and requires re-enrollment.
- `DATABASE_URL`: persistent PostgreSQL connection string in production.
- `AUTH_SECRET`: a private random secret of at least 32 characters. It is
  required whenever `DATABASE_URL` is set and signs session tokens. Keep it
  stable across backend instances and deployments.
- `CORS_ORIGINS`: comma-separated deployed frontend origins, for example
  `https://portal.example.edu`. Include every approved portal origin.
- `FOUNDER_INITIAL_PASSWORD`, `DEAN_INITIAL_PASSWORD`: unique initial passwords
  for the seeded `FOUNDER` and `DEAN` account IDs. Set both to private values
  with at least 12 characters before deploying this login change to production.
  The backend only applies each value when that account has no password. If a
  value is missing, that account cannot sign in until its environment variable
  is set and the backend restarts. Remove these variables after the initial
  setup and manage future passwords from Staff account access.
- Optional warden overrides: `CW_GAJJAR_EMAIL`, `CW_BHABHA_EMAIL`,
  `CW_MTB_EMAIL`, `CW_SVB_EMAIL`, `CW_NEHRU_EMAIL`, `CW_TAGORE_EMAIL`,
  `CW_SARABHAI_EMAIL`, `CW_RAMAN_EMAIL`, and `CW_ABVB_EMAIL`.

The Founder signs in with account ID `FOUNDER`; the seeded SVNIT Dean uses
`DEAN`. The Founder sets a new college's initial Dean password while creating
that college. Each college must have its DNS and TLS configured for its exact
approved portal domain; wildcard DNS/TLS is not used.
The OAuth client's authorized JavaScript origins and backend `CORS_ORIGINS`
must include each deployed portal origin. A tenant can only be resolved for a
configured domain.

The Dean can create warden, department, and club accounts. Use the account ID
shown in the portal as the username, then set its password under Staff account
access. Wardens set passwords for their own hostel staff in the Warden portal.
Email addresses on staff profiles are contact information; they are not used
for staff sign-in. Legacy plaintext passwords are cleared at startup.

Set these variables for the frontend deployment:

- `VITE_API_URL`: deployed backend URL.
- `VITE_GOOGLE_CLIENT_ID`: the same OAuth web client ID as the backend.

### Native Android and iOS test builds

The frontend is wrapped with Capacitor for installing private test builds; no
Play Store or App Store release is required. Install frontend dependencies,
build the web app, and sync it into the native projects with:

```powershell
npm install --prefix frontend
npm run mobile:sync
```

For Android on Windows, install Android Studio and its Android SDK, then open
`frontend/android` in Android Studio. Select **Build > Build Bundle(s) / APK(s)
> Build APK(s)**. Android Studio reports the generated debug APK path; copy it
to the test phone and allow installation from that source. To use the native
BLE scanner, enable Bluetooth and grant the app's requested nearby-device
permissions. Re-run `npm run mobile:sync` after changing web assets or plugins.

iOS projects are scaffolded under `frontend/ios`, but building or signing an
iOS app requires macOS and Xcode. On a Mac, run `npm run mobile:ios` from the
repository root to sync and open the project, then run it on a registered test
device from Xcode. The iOS project includes the Bluetooth usage description
required before requesting access.

If `CORS_ORIGINS` is restricted instead of `*`, allow the Capacitor app origins
used by the generated projects (`https://localhost` on Android and
`capacitor://localhost` on iOS), in addition to the deployed web portal origin.

The current Google sign-in uses Google Identity Services for web. Google
restricts some sign-in flows inside embedded WebViews, so verify student
sign-in on-device early; native Google OAuth may require platform OAuth
clients and a native callback flow. Native camera and BLE use the Capacitor
runtime permission prompts; the app does not grant those permissions silently.

In Google Cloud Console, configure the OAuth consent screen and add every
deployed portal origin to the OAuth client's authorized JavaScript origins. The
frontend stores the signed session token in browser local storage and sends it
to the backend for each API request; logging out removes it.

The Android APK uses native Google Credential Manager rather than a web OAuth
redirect. Keep the Web application OAuth client ID in both `VITE_GOOGLE_CLIENT_ID`
and backend `GOOGLE_CLIENT_ID`; the Android sign-in plugin returns an ID token
for this Web client, which the backend verifies. In the same Google Cloud
project, also create an Android OAuth client for package
`com.hmsenterprise.portal`, registered with the APK signing certificate's SHA-1.
For local debug APKs, get the SHA-1 with
`frontend\android\gradlew.bat signingReport` and register the `debug` variant's
SHA-1. Register separate release and Play App Signing fingerprints when those
builds are introduced. Do not add a custom-scheme URI to the Web client's
authorized redirect URIs: Credential Manager returns the native result through
the Android activity, not a browser redirect. The installed Google plugin
requires the `MainActivity` activity-result handler; Android's existing
`singleTask` activity declaration is retained, and no custom URI intent filter
is used.

On first sign-in, students complete the profile fields required by their
college. Hostel and wing choices are loaded from that college's configuration.

### Complaint routing and registers

Students only see categories configured as Central or for their own hostel.
Central departments (currently Electricity and CCC/LAN) receive cross-hostel
requests. Hostel-specific departments are isolated by hostel: a Gajjar Bhawan
department only receives Gajjar Bhawan complaints. Wardens see every complaint
for their hostel, and can filter their register by Wing A-H and category. The
Dean can configure a warden's work email and each warden can create
hostel-specific maintenance departments with the assigned staff member's
work email. Set passwords for the created staff accounts in Staff account
access. Hostel department IDs are prefixed with the warden
account ID to prevent collisions between hostels.

Warden and Staff portals can export the currently filtered complaint list as a
landscape physical-register PDF. The database startup migration adds the wing
fields to existing user and complaint tables.

## Night attendance and gate outpasses

The Founder enables `attendance` and `gate_outpass` per college. Before taking
attendance, each Warden configures the hostel's attendance start/end times and
the advertised BLE beacon name for each wing. Wardens can start a new roll call
as often as needed during that window; each start creates a distinct session.
Students collect at least three advertisements from the assigned beacon for
1.5 seconds, complete a short-lived flash/blink/head-gesture challenge, and
send only a normalized 128-float on-device embedding to
`/api/attendance/verify-identity`. The backend performs a cosine comparison
against the encrypted 128D enrollment vector. The older client-only
`/api/attendance/mark` path is disabled. Android and iOS builds use passive BLE
scanning and request camera/Bluetooth access through the operating system.
Attendance requires an active Warden roll call. Wardens can add reasoned
manual exceptions for students who cannot use their camera or device.

The enrollment flow requires explicit student confirmation. DeepFace is used
only once during enrollment to create an encrypted 128D reference vector.
Regular attendance never uploads a camera frame. Android enrollment registers
a StrongBox-first P-256 signing key (TEE fallback); the server stores the
public key and verifies each canonical attendance payload.

The backend is pinned to Python 3.11.9 in `.python-version`. DeepFace's
headless OpenCV contrib package provides the OpenCV API without GUI libraries
and avoids installing conflicting OpenCV wheels. DeepFace may download its
Facenet model weights on first use. Warm the model and validate
memory, CPU, throughput, and match accuracy with representative devices before
relying on it for live roll call; Python 3.11 compatibility does not guarantee
1,000 concurrent real-time verifications. Keep `AUTH_SECRET` stable when using
the local encryption-key fallback; production should configure a separate
stable `FACE_ENCRYPTION_KEY`.

## Capacitor OTA updates

The Capacitor updater plugin is configured for native builds and the app calls
`notifyAppReady()` after mounting. From the `frontend` directory, run
`npx capgo login` and `npx capgo init` once to connect the project, then upload
web asset changes with:

```powershell
npm run build
npx capgo upload
```

OTA uploads update web assets only. Changes to native plugins, Android
permissions, or native project code still require a new APK build and release.

Students request a Day or Outstation pass. Day passes must start and end on
the same college-local date; outstation passes are limited to 30 days. Wardens
approve or reject requests and can edit the exact departure and return times;
parent approval is not required. The Warden maintains guardian contact numbers.
An approved pass displays a clear permission card with its exact validity
period and produces a rotating 30-second QR. Gate Security accounts
created by the Dean can scan the OUT and RETURN actions; each action is
single-use, RETURN requires OUT first, and scans outside the approved window
are rejected.

The Warden opens a two-minute device-enrollment window for a resident. The
student registers the app-stored device token during that window. Production
attendance accepts only a signed `HMS-<WING_ID>-<8_CHAR_HMAC>` beacon within
the current rolling time window and stronger than -80 dBm. Student-controlled
beacon simulation is not available; supervised test overrides must be
explicitly scoped and time-limited by an authorized Warden.

The Face Landmarker model and required WebAssembly runtimes are bundled under
`frontend/public/models/` for offline use in native builds. Supply the
quantized MobileFaceNet ONNX asset as
`frontend/public/models/mobilefacenet.onnx` (or set
`VITE_FACE_EMBEDDING_MODEL_URL`) before release.

Digital leave requests support Day Outpass and Home Leave (up to 30 calendar
days). Wardens review requests, can call the listed parent/guardian number, and
can approve or reject without parent approval. An approved pass uses the
existing rotating, signed gate QR. Approval also adds an `On Approved Leave`
attendance log for every leave date.

Guardian WhatsApp notifications are optional; they do not participate in
outpass approval. Existing consent and the college's `parent_alerts` flag are
required before a notification is queued. Approval currently queues a
notification in the database; it does **not** send a WhatsApp message. A
WhatsApp provider account, deployment secrets, and a delivery worker must be
configured before messages can be sent.

## Run the frontend

From the repository root:

```sh
npm install --prefix frontend
npm run dev
```

## Run the backend locally

Python 3.11.9 is pinned in `.python-version` and `runtime.txt`. On Windows,
create and install the backend environment with:

```powershell
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
backend\.venv\Scripts\python.exe -m uvicorn main:app --reload --app-dir backend
```

To use the local backend, set `VITE_API_URL=http://127.0.0.1:8000` in
`frontend/.env.local` before starting the frontend. Otherwise, the frontend
uses its configured hosted API.

## Verify the frontend

```sh
npm run build
npm run lint
```

## Verify the backend

```powershell
backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

These tests exercise the local SQLite workflows. They do not replace a
PostgreSQL migration/RLS test; verify tenant isolation against PostgreSQL using
the intended non-superuser application role before production rollout.
