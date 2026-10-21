# Deployment

Two supported paths: a **native** local setup (what this workspace uses) and a
**Docker Compose** stack (reference; Docker is not installed on the authoring
machine, so it is unverified — see the note in `infra/docker/docker-compose.yml`).

## Configuration

Copy `.env.example` to `services/api/.env`. Key variables:

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/cyberbook` |
| `API_PORT` | no (4000) | API listen port |
| `API_GLOBAL_PREFIX` | no (`api/v1`) | Global route prefix |
| `JWT_ACCESS_SECRET` | prod | Must be a strong unique value in production |
| `JWT_REFRESH_SECRET` | prod | Must be a strong unique value in production |
| `CORS_ORIGINS` | no | Comma-separated allowed origins |
| `SEED_DEVELOPMENT_DATA` | no | Must be `false` in production |
| `DEV_VERIFICATION_FALLBACK` | no | Must be `false` in production |

Boot-time validation (`env.validation.ts`) fails fast if `DATABASE_URL` is
missing or if production is started with dev secrets or dev flags.

## Native

```bash
npm install
npm run db:migrate --workspace @cyberbook/api   # prisma migrate deploy
npm run db:generate --workspace @cyberbook/api
npm run db:seed --workspace @cyberbook/api       # optional, dev only
npm run build:api
node services/api/dist/main.js                    # or: npm run start:prod -w @cyberbook/api

# Web (same-origin by default; the Next server proxies /api/v1 to the API)
API_INTERNAL_URL=http://localhost:4000 npm run build:web
npm run start --workspace @cyberbook/web          # serves the Next standalone/start server on :3000
```

The web app calls the API on its **own origin** (`/api/v1/...`); Next rewrites
those requests to `API_INTERNAL_URL` (default `http://localhost:4000`). This
avoids CORS and mixed-content problems (e.g. when the site is served over HTTPS
via a tunnel). `NEXT_PUBLIC_API_BASE_URL` remains an optional override that
points the browser directly at an absolute API URL instead.

Migrations are applied with `prisma migrate deploy` (non-interactive, safe for
CI/CD). Never use `migrate dev` against production.

## Vercel (web app)

The repository is an **npm workspaces monorepo**. Only `apps/web` is deployed to
Vercel; the NestJS API in `services/api` is deployed separately (Render, Railway,
Fly.io, a VPS — anything that can run a Node service with a PostgreSQL database).

### Project settings (Vercel dashboard → Settings → General)

| Setting | Value | Why |
| ------- | ----- | --- |
| Root Directory | `apps/web` | The Next.js app lives here. |
| Framework Preset | Next.js | Auto-detected; do not override. |
| Build Command | `npm run build` (default) | Runs `next build` inside `apps/web`. Equivalent to the repo-root `npm run build:web`. |
| Install Command | `npm ci` | Vercel runs it at the **repository root** (monorepo), using the root `package-lock.json`. |
| Output Directory | `apps/web/.next` | Default; do not change. |
| Node.js Version | 22.x | Matches `engines.node >= 20.11.0`. |

The repo-root `vercel.json` makes the same build reproducible if the project is
configured with the repository root as the Root Directory instead.

### Environment variables (Vercel → Settings → Environment Variables)

| Variable | Scope | Value | Required |
| -------- | ----- | ----- | -------- |
| `API_INTERNAL_URL` | Production + Preview | Public origin of the deployed API, e.g. `https://api.cyberbook.uz` | **yes** |
| `NEXT_PUBLIC_API_BASE_URL` | — | Leave unset | no |
| `NODE_VERSION` | — | `22` (optional; also set in `vercel.json`) | no |

`API_INTERNAL_URL` must be the **server-side** API origin (no `/api/v1` suffix —
the Next proxy appends it). It is read only by the Next server and is never
exposed to the browser. Leaving it unset falls back to `http://localhost:4000`,
which does not exist on Vercel: the site will build, but every page that talks
to the API (`/`, `/clubs`, `/clubs/[slug]`) will render its empty/error state.

The browser always calls `/api/v1/*` on the web app's own origin; Next rewrites
those requests to `API_INTERNAL_URL`. No API credentials, database URLs or
secrets are ever shipped to the client.

### Redeploying

```bash
git checkout main
git pull origin main
npm ci
npm run build --workspace @cyberbook/web   # must succeed locally too
git push origin main                      # triggers a Vercel deployment
```

If the Vercel project is configured with the repository root as the Root
Directory instead of `apps/web`, keep the root `vercel.json` in place — it
supplies `buildCommand`, `installCommand` and `outputDirectory`.

## Docker Compose

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

Services:

- `db` — `postgres:16` with a named volume `pgdata`.
- `api` — built from `infra/docker/Dockerfile.api`; runs
  `prisma migrate deploy && node dist/main` on start.
- `web` — built from `infra/docker/Dockerfile.web` (Next.js standalone output).

The API container needs a Linux base with `openssl` for the Prisma engine
(already handled in the Dockerfile). Set strong `JWT_*` secrets and
`SEED_DEVELOPMENT_DATA=false` for any non-demo deployment.

## Production checklist

- [ ] Strong, unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (e.g. `openssl rand -hex 48`).
- [ ] `NODE_ENV=production`, `SEED_DEVELOPMENT_DATA=false`, `DEV_VERIFICATION_FALLBACK=false`.
- [ ] Managed PostgreSQL with backups; run migrations via `prisma migrate deploy`.
- [ ] TLS termination in front of the API; restrict `CORS_ORIGINS` to real origins.
- [ ] Configure real SMTP/SMS/payment providers (see `.env.example`) before relying on them.
- [ ] Set `API_INTERNAL_URL` to the API address reachable from the Next server
      (the browser talks to `/api/v1` on the web origin and Next proxies it).
      Only set `NEXT_PUBLIC_API_BASE_URL` if the browser must call the API on a
      different host directly (it is inlined at build time).
- [ ] Consider moving web tokens to `httpOnly` cookies (see `docs/SECURITY.md`).

## Health & observability

- `GET /api/v1/health` — liveness/readiness. Use it for container/orchestrator probes.
- Structured logs via `nestjs-pino` (JSON), with sensitive fields redacted.
- Swagger UI at `/docs` — consider disabling in production if not desired.
