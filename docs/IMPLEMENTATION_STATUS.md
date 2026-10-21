# Implementation Status

Honest breakdown of what is implemented and verified in this workspace versus
what is a seam/stub or could not be verified locally.

**Verification environment:** Windows, Node 24, PostgreSQL 16 (native, no
Docker), no Flutter SDK, no Redis.

## Legend

- ✅ **Verified** — implemented and exercised locally (build/lint/typecheck/tests
  or a live smoke test).
- 🟡 **Implemented, not verified** — code is complete but could not be run here.
- 🔶 **Stub / seam** — interface exists; a real provider or further work is needed.
- ❌ **Not implemented**.

## Backend API (`services/api`)

| Area | Status | Notes |
| ---- | ------ | ----- |
| Prisma schema (25 models/enums) | ✅ | Migrated and seeded |
| Migrations (init + exclusion constraint) | ✅ | Applied to local DB |
| Auth: register/login/refresh/logout/logout-all | ✅ | Smoke-tested |
| Auth: verify code, forgot/reset password | ✅ | Code path present; delivery is a stub |
| JWT guard re-reads user each request | ✅ | |
| RBAC (`@Roles`, `ClubAccessService`) | ✅ | 403 tested (player → admin) |
| Clubs: search, detail, CRUD, submit, staff | ✅ | Search + detail smoke-tested |
| Stations + categories (CRUD, bulk, status) | ✅ | |
| Operating hours + special closures | ✅ | |
| Availability engine | ✅ | Smoke-tested |
| Pricing rules + price quote | ✅ | Quote smoke-tested; unit-tested |
| Maintenance blocks | ✅ | |
| **Bookings engine** | ✅ | Create/replay/overlap/cancel smoke-tested; state unit-tested |
| Idempotency | ✅ | Replay verified |
| Overlap prevention (advisory lock + GiST exclusion) | ✅ | 409 verified; constraint verified in DB |
| Booking scheduler (expire pending, reminders) | 🟡 | Runs via `@nestjs/schedule`; not observed in a long-running test |
| Payments: pay-at-club | ✅ | |
| Payments: online (Payme/Click) | 🔶 | `HmacProviderAdapter` throws until configured |
| Reviews + rating aggregation | ✅ | |
| Favorites | ✅ | |
| Notifications (in-app) | ✅ | |
| Notifications: email/SMS/push | 🔶 | No-op/log fallback; no real transport wired |
| Support tickets | ✅ | |
| Admin (approvals, users, settings, stats) | ✅ | Stats + 403 smoke-tested |
| Audit log | ✅ | |
| Health check | ✅ | Smoke-tested |
| Env validation (fail-fast) | ✅ | |
| Swagger docs | ✅ | `/docs` returns 200 |

### Verification commands run

- `npm run lint --workspace @cyberbook/api` → 0 errors.
- `npm run typecheck --workspace @cyberbook/api` → pass.
- `npm run build --workspace @cyberbook/api` → pass.
- `npm run test --workspace @cyberbook/api` → **4 suites / 37 tests pass**;
  the isolated-DB integration suite (`bookings.integration.spec.ts`, 11 tests) is
  skipped unless `RUN_DB_TESTS=1` + `TEST_DATABASE_URL` point at a `*test*` DB.
- Integration suite run against an isolated `cyberbook_test` DB →
  **11/11 pass** (incl. two concurrent overlapping requests → exactly one wins).
- Live smoke test → **16/16 checks pass** (health, discovery, auth, availability,
  quote, create, idempotent replay, overlap 409, list, cancel, admin stats, RBAC 403).

## Web (`apps/web`)

| Area | Status | Notes |
| ---- | ------ | ----- |
| App shell, theme, header, auth context | ✅ | |
| Same-origin API proxy (`next.config.mjs` rewrite) | ✅ | Browser calls `/api/v1`; no CORS/mixed-content |
| Home + club search (list view) | ✅ | Server component feeds a client explorer |
| Club discovery map + "near me" (geolocation) | ✅ | Dependency-free OSM slippy map; sorts by real `distanceKm` |
| Club detail + booking widget | ✅ | Availability-driven slots, quote, idempotency key |
| Login / register | ✅ | |
| My bookings (list + cancel) | ✅ | |
| Favorites | ✅ | |
| Owner dashboard + club management (stations/hours/pricing/bookings) | ✅ | Bookings tab has status/date filters + status breakdown |
| Admin dashboard (stats/clubs/users/tickets) | ✅ | |
| Build (types + lint + 10 routes) | ✅ | `next build` passes |

Verified end-to-end in headless Edge (through the same-origin proxy, 0 console
errors): list→map→list toggle renders 3 markers over loaded OSM tiles;
"Near me" geolocation sorts by distance; owner login → club management → booking
status filter issues `GET /api/v1/clubs/3/bookings?status=CONFIRMED`.

Not yet done: i18n switcher, image uploads. The map uses public
OpenStreetMap tiles (attribution shown); a paid/self-hosted tile source is
recommended for production traffic.

## Shared packages

| Package | Status | Notes |
| ------- | ------ | ----- |
| `@cyberbook/api-client` | ✅ | Typecheck + lint pass; used by web |
| `@cyberbook/config` | ✅ | tsconfig base only |

## Mobile (`apps/mobile`)

| Area | Status | Notes |
| ---- | ------ | ----- |
| App bootstrap, providers, theme | 🟡 | Source complete, not built |
| Dio API client + models | 🟡 | Mirrors the REST contract |
| Auth state + token storage | 🟡 | `shared_preferences` |
| Home/search, club detail + booking, login, register, bookings, favorites | 🟡 | |
| `flutter analyze` / `flutter test` / `flutter build` | ❌ | No Flutter SDK available here |

## Infra & CI

| Item | Status | Notes |
| ---- | ------ | ----- |
| Dockerfiles (api, web) | 🟡 | Written; Docker not available to build |
| docker-compose (db/api/web) | 🟡 | Written; not run |
| GitHub Actions CI | 🟡 | Written; not executed (no git remote here) |
| Local native run | ✅ | The supported, verified path |

## Cross-cutting gaps

- No account lockout after repeated failed logins.
- Web stores tokens in `localStorage` (should move to httpOnly cookies).
- No MFA/2FA.
- UI strings are English-only; category labels carry uz/ru/en but there is no
  locale switcher.
- Occupancy percentage uses a documented 14-hour assumption rather than each
  club's real hours.
- Online payments and message delivery are intentionally disabled until real
  provider credentials and signature verification are added.

## Legacy code

`backend/` is a partial Spring Boot application that predates this
implementation. It is **superseded** by `services/api` and kept untouched for
reference only. Nothing in the active stack depends on it.
