# Architecture

CyberBook is a three-tier monorepo: a shared PostgreSQL database, a NestJS API,
and two clients (Next.js web, Flutter mobile) that both talk to the API over
REST. There is no server-side rendering dependency between the clients and the
API — the web app is the only one that also renders some pages on the server
using a public API client.

```
┌────────────┐      ┌────────────┐
│  apps/web  │      │ apps/mobile│
│ Next.js 15 │      │  Flutter   │
└─────┬──────┘      └─────┬──────┘
      │  HTTP (REST)      │  HTTP (Dio)
      │  @cyberbook/api-client │
      └──────────┬────────┘
                 ▼
        ┌─────────────────┐
        │  services/api   │  NestJS 10
        │  /api/v1        │  Swagger at /docs
        └────────┬────────┘
                 ▼
        ┌─────────────────┐
        │  PostgreSQL 16  │  Prisma 6
        └─────────────────┘
```

## API (services/api)

### Cross-cutting pipeline

Every request passes through a global pipeline configured in `app.module.ts` and
`main.ts`:

1. **Throttler** (`ThrottlerGuard`, registered first) — rate limiting.
2. **JwtAuthGuard** — verifies the access token and re-loads the user from the
   database on every request, so a banned/deleted user loses access immediately.
   Routes marked `@Public()` skip this.
3. **RolesGuard** — enforces `@Roles(...)` declarations.
4. **ResponseInterceptor** — wraps every success as `{ success, message, data }`.
5. **HttpExceptionFilter** — normalizes errors to `{ success:false, message, code }`
   and maps Prisma errors (`P2002` unique violations, exclusion-constraint
   violations) to HTTP 409.

Validation is global (`ValidationPipe`) using `class-validator` DTOs.

### Modules

| Module | Responsibility |
| ------ | -------------- |
| `auth` | Register, login, refresh, logout, verification codes, password reset |
| `users` | Current-user profile, password change, self-delete |
| `clubs` | Discovery/search, club CRUD, owner dashboard, staff memberships |
| `stations` | Station CRUD, categories, bulk create |
| `hours` | Weekly operating hours + special closures |
| `pricing` | Pricing rules CRUD and the **price quote** engine |
| `maintenance` | Maintenance blocks for stations |
| `availability` | Computes free/busy windows per station per day |
| `bookings` | The booking engine (create, list, cancel, status, check-in) + scheduler |
| `payments` | Payment provider registry; pay-at-club now, online providers as adapters |
| `reviews` | Post-visit reviews + rating aggregation |
| `favorites` | User favourites |
| `notifications` | In-app notifications |
| `support` | Support tickets + messages |
| `admin` | Platform-admin operations (approvals, users, settings, stats) |
| `audit` | Append-only audit log |
| `health` | Liveness/readiness probe |

`NotificationsModule`, `AuditModule` and `CommonServicesModule` are `@Global`, so
feature modules use them without importing. `ClubsModule` exports `ClubsService`
and `ClubAccessService`; `PricingModule` exports `PricingService`.

### Key services

- **`ClubAccessService`** — one place that answers "may this user manage this
  club?" (owner, staff membership, or admin).
- **`ClubScheduleService`** (`common/services`) — expands weekly hours + closures
  into concrete UTC `[start, end)` windows for a given club-local date, including
  overnight shifts.
- **`PricingService`** — resolves the effective rate for a station/time and
  produces a persisted `priceSnapshot`.
- **`BookingsService`** — the transactional booking engine (see
  [`BOOKING_RULES.md`](BOOKING_RULES.md)).
- **`BookingScheduler`** — periodic job that expires stale `PENDING` bookings and
  completes past `CONFIRMED` ones.

### Shared code seams

- **Payments** (`payment-providers.ts`): a provider registry with a
  `PayAtClubAdapter` (fully working) and `HmacProviderAdapter` placeholders for
  Payme/Click that throw until real credentials are configured. Adding a provider
  means implementing the adapter interface and registering it.
- **Notifications/SMS/Email**: emit domain events; transports are no-op/log in
  development when credentials are absent.

## Web (apps/web)

Next.js App Router with:

- Server components for public, cacheable-ish pages (home, club detail) using an
  unauthenticated `publicApi` client.
- Client components for everything interactive (auth context, booking widget,
  owner dashboard, admin).
- Tokens are held in `localStorage` via `lib/session.ts` and injected by a
  per-session `CyberBookClient`.
- Shared DTO types and the fetch client come from `@cyberbook/api-client`
  (transpiled by Next via `transpilePackages`).

## Mobile (apps/mobile)

Flutter app using `provider` for state and `dio` for HTTP. It duplicates the
`@cyberbook/api-client` contract in Dart (`lib/src/api/`). Tokens are persisted
with `shared_preferences`. See `apps/mobile/README.md`.

**This module is source-only and has not been built** (no Flutter SDK on the
authoring machine).

## Data & conventions

- Money: `BIGINT` integer so'm; helper `money.util.ts`.
- Time: stored UTC, rendered in the club timezone (`time.util.ts`).
- All interval math uses `[start, end)`.
- See [`DATABASE.md`](DATABASE.md) for the full schema.
