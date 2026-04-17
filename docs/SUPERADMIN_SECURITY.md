# Superadmin Security

This project enforces superadmin security based on the DB setting `security_policy` (editable in Web → Superadmin → `Settings` → `Security`).

## What is enforced

- **2FA (TOTP)**: optional per-account, and can be enforced for all superadmins via policy.
- **Session timeout**: superadmin JWT tokens are issued with an expiry (minutes) from policy.
- **IP allowlist**: when enabled, superadmin logins + superadmin API routes are allowed only from the configured IPs.
- **Password policy**: minimum password length and password rotation (days) are enforced for superadmin login and password-setting flows.

## Configure in UI

Go to `Superadmin → Settings → Security`:

- `Enforce 2FA for super admins`
- `Session timeout (minutes)`
- `Restrict logins by IP allowlist`
- `Superadmin IP allowlist (comma separated)`
- `Minimum Length`
- `Rotation (days)` (0 disables rotation)

## 2FA (TOTP) setup API

All endpoints require `Authorization: Bearer <token>` and superadmin role:

- `GET /api/auth/superadmin/2fa/status`
- `POST /api/auth/superadmin/2fa/setup` → returns:
  - `secretBase32` (manual entry in Google Authenticator/Authy/etc.)
  - `otpauthUrl` (can be converted to a QR code by any QR tool)
- `POST /api/auth/superadmin/2fa/enable` with JSON `{ "otp": "123456" }`
- `POST /api/auth/superadmin/2fa/disable` with JSON `{ "otp": "123456" }`

## Proxy / correct IP detection

If you run behind a proxy / load balancer and want correct allowlist behavior, set:

- `TRUST_PROXY=true`

This enables Express `trust proxy` and the server will read `X-Forwarded-For` for the client IP.

