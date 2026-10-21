# Testing

## API unit tests

Jest with `ts-jest` (`services/api/jest.config.js`), test roots limited to `src/`.

```bash
npm run test:api          # or: npm run test --workspace @cyberbook/api
npm run test:unit --workspace @cyberbook/api
```

Current coverage (pure logic, no database required):

| File | What it covers |
| ---- | -------------- |
| `common/utils/money.util.spec.ts` | integer-UZS money math, half-up rounding, formatting |
| `common/utils/time.util.spec.ts` | timezone conversion, overnight/day-window helpers |
| `bookings/booking-state.spec.ts` | blocking statuses and allowed transitions |
| `pricing/pricing.service.spec.ts` | price resolution precedence and snapshot fields |

These are deterministic and fast, and run in CI without services.

## Integration / end-to-end smoke test

A PowerShell smoke script (used during development) exercises the running API
end-to-end: health, discovery, owner login, club detail, availability,
price-quote, create booking, idempotent replay, overlap → 409, my bookings,
cancel, admin stats, and a role check (player → admin 403). It requires:

- The API running (`npm run dev:api`).
- A migrated + seeded database.

For CI, the workflow at `.github/workflows/ci.yml` starts a Postgres service,
generates the Prisma client, applies migrations, seeds, then runs lint,
typecheck, unit tests and the build.

## Web

```bash
npm run typecheck --workspace @cyberbook/web
npm run lint --workspace @cyberbook/web      # next lint
npm run build --workspace @cyberbook/web     # type-checks + lints during build
```

There is no browser-level test suite yet; the build gate verifies types and lint.

## Mobile (Flutter)

Not run in this workspace (no Flutter SDK). When available:

```bash
cd apps/mobile
flutter pub get
flutter analyze
flutter test      # once tests are added
```

## Conventions for new tests

- Prefer **pure unit tests** for logic (pricing, time, state) — no DB.
- Keep DB-touching tests behind an explicit integration path and a running
  Postgres so the default `test` run stays hermetic.
- Money assertions must use integer UZS; never compare floats.
