# CyberBook

CyberBook is a computer-gaming-club discovery and reservation platform for
Uzbekistan. It lets players find clubs and reserve a specific station ("seat") by
the half hour, and gives club owners and platform admins the tools to manage
stations, hours, pricing, bookings and approvals.

The project is an npm-workspaces monorepo:

| Path | What it is | Stack |
| ---- | ---------- | ----- |
| `services/api` | Backend API and booking engine | NestJS 10, Prisma 6, PostgreSQL 16 |
| `apps/web` | Public site + owner/admin dashboards | Next.js 15 (App Router), React 19, Tailwind |
| `apps/mobile` | Player mobile app (source only, unverified) | Flutter, Dio, provider |
| `packages/api-client` | Shared typed REST client + DTO types | TypeScript |
| `packages/config` | Shared tsconfig base | TypeScript |
| `infra/docker` | Dockerfiles + compose (reference, unverified) | Docker |
| `backend/` | **Legacy** partial Spring Boot app — superseded, kept for reference | Spring Boot 3.3.5 |

## Quickstart (local, no Docker)

Prerequisites: Node >= 20.11, npm, a running PostgreSQL 16 instance.

```bash
# 1. Install workspace dependencies (repo root)
npm install

# 2. Configure the API
copy .env.example services\api\.env      # Windows (PowerShell)
# edit DATABASE_URL if your Postgres differs from the default below

# 3. Create schema, generate the client, seed demo data
npm run db:migrate --workspace @cyberbook/api
npm run db:generate --workspace @cyberbook/api
npm run db:seed --workspace @cyberbook/api

# 4. Run the API (http://localhost:4000, Swagger at /docs)
npm run dev:api

# 5. In another terminal, run the web app (http://localhost:3000)
npm run dev:web
```

Default local database URL: `postgresql://postgres@localhost:5432/cyberbook`.

### Demo accounts (development seed only)

Enabled when `SEED_DEVELOPMENT_DATA=true` and `NODE_ENV!==production`:

| Email | Role |
| ----- | ---- |
| `player@cyberbook.dev` | USER |
| `owner@cyberbook.dev` | CLUB_OWNER |
| `staff@cyberbook.dev` | STAFF |
| `admin@cyberbook.dev` | ADMIN |

Password: `Password123!` (override with `SEED_DEV_PASSWORD`).

## Common scripts

```bash
npm run lint          # lint every workspace
npm run typecheck     # typecheck every workspace
npm run build:api     # build the API
npm run build:web     # build the web app
npm run test:api      # API unit tests
npm run db:migrate    # apply migrations
npm run db:seed       # seed data
npm run db:reset      # drop + recreate + migrate
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and module map
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema and data model
- [`docs/API.md`](docs/API.md) — REST endpoint reference
- [`docs/BOOKING_RULES.md`](docs/BOOKING_RULES.md) — availability, pricing, concurrency
- [`docs/SECURITY.md`](docs/SECURITY.md) — auth, RBAC, hardening notes
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — native and Docker deployment
- [`docs/TESTING.md`](docs/TESTING.md) — how to run and extend tests
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) — **what works vs. what is stubbed**

## Status

The API, web app and database are implemented and verified locally (build,
lint, typecheck, unit tests, and an end-to-end smoke test all pass). See
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) for the exact
verified/unverified breakdown. Online payment providers, SMS/email delivery and
the Flutter app are implemented as seams/stubs and are not verified here.

## Conventions

- **Money** is always an integer number of so'm (UZS) — never a floating value.
- **Time** is stored as UTC (`timestamptz`) and rendered in the club's timezone.
- Successful responses are wrapped as `{ success, message, data }`.
- All times use the half-open interval `[startsAt, endsAt)`.
