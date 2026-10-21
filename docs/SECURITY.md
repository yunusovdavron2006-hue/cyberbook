# Security

## Authentication

- **Access tokens**: JWTs signed with `JWT_ACCESS_SECRET`, lifetime
  `JWT_ACCESS_TTL_MINUTES` (default 15). Payload: `{ sub, email, role, jti }`.
- **Refresh tokens**: opaque 48-byte random strings. Only their **SHA-256 hash**
  is stored (`sessions.token_hash`), so a database leak does not expose usable
  tokens. Lifetime `JWT_REFRESH_TTL_DAYS` (default 14).
- **Rotation**: `POST /auth/refresh` revokes the presented session and issues a
  new pair. `POST /auth/logout` revokes one session; `POST /auth/logout-all`
  revokes every session for the user.
- `JwtAuthGuard` **re-reads the user from the database on every request** and
  rejects `ACTIVE`-only violations, so bans/deactivations take effect immediately
  rather than when the JWT expires.

## Authorization (RBAC)

- Global guards run in order: throttler → JWT → roles.
- `@Public()` marks routes that skip authentication.
- `@Roles(...)` restricts by role (`USER`, `CLUB_OWNER`, `STAFF`, `ADMIN`).
- Club-scoped operations go through `ClubAccessService`, which resolves the
  effective permission from: owner (`club.ownerId`), staff/manager membership
  (`club_memberships`), or `ADMIN`. This means a `STAFF` user only manages the
  clubs they belong to.

## Passwords & secrets

- Passwords hashed with **bcrypt** (`BCRYPT_SALT_ROUNDS`, default 12).
- Verification codes are stored as SHA-256 hashes, never plaintext.
- Log redaction (pino) removes `authorization`, `cookie`, `password`, `token`,
  `code`, `passwordHash`, `codeHash`.
- Production requires strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
  (validated at boot by `env.validation.ts`).

## Transport & headers

- CORS is restricted to `CORS_ORIGINS` (comma-separated) with credentials.
- A security-headers middleware sets `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-*` policies and a
  restrictive `Permissions-Policy`.
- `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`, so unexpected
  fields are rejected.

## Rate limiting

- `@nestjs/throttler` is registered globally. Defaults:
  `RATE_LIMIT_TTL_SECONDS` (60) and `RATE_LIMIT_MAX_GENERAL` (300). Auth-specific
  tighter limits are configured via `RATE_LIMIT_MAX_AUTH`.

## Auditing

- Security-relevant actions (booking create/cancel/status, club changes, admin
  actions, auth events) are written to the append-only `audit_logs` table with
  actor, action, entity, metadata and IP.

## Known gaps / hardening TODO

- **No account lockout** on repeated failed logins (a counter field would be
  needed).
- Web app stores tokens in `localStorage` (XSS-exposed). A hardened deployment
  should move to `httpOnly` cookies set by the server.
- No CSRF protection (not needed for bearer-token APIs, but relevant if cookies
  are adopted).
- No MFA / 2FA.
- Payment provider webhooks are stubbed; signature verification must be added
  before enabling online payments (see `payments/payment-providers.ts`).

## Reporting

This is an MVP/demo. Do not deploy to production with the example secrets or
`SEED_DEVELOPMENT_DATA` / `DEV_VERIFICATION_FALLBACK` enabled.
