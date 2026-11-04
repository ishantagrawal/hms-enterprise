# Security Policy

## Supported releases

Security fixes are applied to the default branch and the currently deployed production release.

## Reporting a vulnerability

Do not disclose vulnerabilities in public issues. Email a reproducible report, affected endpoint or file, impact, and safe proof of concept to `security@svnitcampus.in`. We acknowledge reports within 7 days and coordinate remediation and disclosure with the reporter.

## Zero-trust architecture

- Production secrets are supplied only through the deployment environment; no secret is bundled in the web or Android client.
- Authentication, tenant isolation, role authorization, device binding, beacon HMAC validation, RSSI validation, and server-side face verification are enforced at the API boundary.
- Biometric reference data is encrypted at rest and live verification frames are processed in memory and cleared after each request.
- Student data access is scoped to the authenticated student, tenant, and authorized staff role.
- Security-sensitive changes require focused tests and dependency review before release.
