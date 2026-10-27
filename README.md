# HMS Enterprise

## SVNIT Google Sign-In and production setup

The application uses Google Identity Services for sign-in. The backend verifies
the Google ID token, requires a verified `@svnit.ac.in` or subdomain address,
and matches privileged accounts by the exact email stored in the `users` table.
Student accounts can be created on first sign-in when the email local part is a
configured roll number such as `U26CE011`.

Configure these environment variables on the backend host:

- `GOOGLE_CLIENT_ID`: OAuth web client ID; defaults to the client ID configured
  for this project.
- `DATABASE_URL`: persistent PostgreSQL connection string in production.
- `CORS_ORIGINS`: comma-separated deployed frontend origins, for example
  `https://hms.example.edu`; use `*` only for local development.
- `FOUNDER_EMAIL`, `DEAN_EMAIL`: the exact official Google accounts that should
  receive Founder and Dean access.
- Optional warden overrides: `CW_GAJJAR_EMAIL`, `CW_BHABHA_EMAIL`,
  `CW_MTB_EMAIL`, `CW_SVB_EMAIL`, `CW_NEHRU_EMAIL`, `CW_TAGORE_EMAIL`,
  `CW_SARABHAI_EMAIL`, `CW_RAMAN_EMAIL`, and `CW_ABVB_EMAIL`.

Email override values are validated at backend startup. Set the Founder and
Dean addresses before the initial deployment so the administrators can sign in
and configure the remaining accounts. Once signed in, the Dean can map each
warden account to its official email. A department or club account must also be
assigned an official Google email in its creation form. Anyone whose address
does not match a configured privileged account is not granted that role.
Password sign-in and password-reset flows have been removed; startup clears
legacy plaintext passwords and DOB values previously used as passwords from
the user table. All existing privileged users must use their configured
official Google email.

Set these variables for the frontend deployment:

- `VITE_API_URL`: deployed backend URL.
- `VITE_GOOGLE_CLIENT_ID`: the same OAuth web client ID as the backend.

In Google Cloud Console, configure the OAuth consent screen for SVNIT users and
add the deployed frontend origin to the OAuth client's authorized JavaScript
origins. The frontend stores the Google ID token in browser local storage and
sends it to the backend for each API request; logging out removes it.

New student self-registration currently accepts roll numbers formatted as
`U` + two-digit admission year + a configured branch code + three digits.
Supported branch codes are listed in `backend/main.py`; confirm those codes
against the institute's current roll-number format before enabling broad access.
On first sign-in, students must select a configured hostel, Wing A-H, room, and
mobile number before the portal is usable. Hostel choices are sourced from the
configured warden accounts.

### Complaint routing and registers

Students only see categories configured as Central or for their own hostel.
Central departments (currently Electricity and CCC/LAN) receive cross-hostel
requests. Hostel-specific departments are isolated by hostel: a Gajjar Bhawan
department only receives Gajjar Bhawan complaints. Wardens see every complaint
for their hostel, and can filter their register by Wing A-H and category. The
Dean can configure a warden's account email and each warden can create
hostel-specific maintenance departments with the assigned staff member's
official Google email. Hostel department IDs are prefixed with the warden
account ID to prevent collisions between hostels.

Warden and Staff portals can export the currently filtered complaint list as a
landscape physical-register PDF. The database startup migration adds the wing
fields to existing user and complaint tables.

## Run the frontend

From the repository root:

```sh
npm install --prefix frontend
npm run dev
```

## Run the backend locally

In a separate terminal:

```sh
python -m pip install -r backend/requirements.txt
npm run dev:backend
```

To use the local backend, set `VITE_API_URL=http://127.0.0.1:8000` in
`frontend/.env.local` before starting the frontend. Otherwise, the frontend
uses its configured hosted API.

## Verify the frontend

```sh
npm run build
npm run lint
```
