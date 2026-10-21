# Database

PostgreSQL 16, accessed through Prisma. The schema lives at
`services/api/prisma/schema.prisma` and is the single source of truth.

## Conventions

- **Money** is `BIGINT` (integer so'm, UZS). Never floating point.
- **Timestamps** are `timestamptz` and always UTC. Club-local rules are stored as
  `"HH:mm"` strings interpreted in `Club.timezone` (default `Asia/Tashkent`).
- **Intervals** are half-open: `[startsAt, endsAt)`.
- Table/column names are snake_case (Prisma `@map`).

## Enums

`Role`, `UserStatus`, `ClubStatus`, `MembershipRole`, `StationStatus`,
`StationCategoryKey`, `BookingStatus`, `PaymentMethod`, `PaymentStatus`,
`PricingUnit`, `ReviewStatus`, `TicketStatus`, `VerificationPurpose`,
`NotificationType`.

## Tables

### Auth & users

- **`users`** — identity, role, status, `password_hash`, locale.
- **`user_profiles`** — display name, avatar, birth date (1:1 with user).
- **`sessions`** — opaque refresh tokens (sha256 `token_hash`), expiry, revocation.
- **`verification_codes`** — hashed email/phone/reset codes with purpose + expiry.

### Clubs & inventory

- **`clubs`** — owner, slug, location, `status`, `timezone`, denormalized
  `rating`/`review_count`.
- **`club_branches`** — optional sub-locations; stations may belong to a branch.
- **`club_memberships`** — `(club, user)` → role (`OWNER`/`MANAGER`/`STAFF`).
- **`station_categories`** — reference table seeded with `PC`, `VIP_PC`,
  `BOOTCAMP`, `CONSOLE` (labels in uz/ru/en).
- **`stations`** — a bookable seat: category, label, `status`, `specs` (JSON),
  `price_per_hour` (base), sort order.
- **`operating_hours`** — weekly schedule; `closes_at <= opens_at` means overnight.
- **`special_closures`** — date-specific closures.
- **`maintenance_blocks`** — time-ranged maintenance that also blocks availability.
- **`pricing_rules`** — overrides with `unit`, `amount`, `priority`, optional
  `day_of_weeks`, optional local time window, and optional station/category scope.

### Bookings & payments

- **`bookings`** — `reference`, user, club, station, `starts_at`/`ends_at`,
  `status`, `price_amount` + `price_snapshot` (JSON), payment fields,
  `expires_at`, and nullable `idempotency_key`.
  - `@@unique([userId, idempotencyKey])` makes request replay safe.
  - Indexes for club/time, user/time, station/time and status/expiry queries.
- **`booking_events`** — append-only status/action history.
- **`payments`** — one row per booking, provider + provider ref + idempotency key.

### Social, support, ops

- **`favorites`** — `(user, club)` unique.
- **`reviews`** — one per booking (`booking_id` unique) and one per `(user, club)`;
  rating 1..5; `status` for moderation.
- **`notifications`** — in-app notifications with `read_at`.
- **`support_tickets`** / **`support_ticket_messages`** — support threads.
- **`audit_logs`** — append-only actor/action/entity records.
- **`platform_settings`** — key/value JSON settings (admin editable).

## Migrations

- `prisma/migrations/20261016171011_init` — full initial schema.
- `prisma/migrations/20261016171024_booking_no_overlap` — adds `btree_gist` and a
  partial exclusion constraint that makes overlapping active bookings impossible
  at the database level:

  ```sql
  ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_no_overlap_per_station"
    EXCLUDE USING gist (
      "station_id" WITH =,
      tstzrange("starts_at", "ends_at", '[)') WITH &&
    ) WHERE ("status" IN ('PENDING','CONFIRMED'));
  ```

  This is the second line of defense behind the application-level advisory lock
  (see [`BOOKING_RULES.md`](BOOKING_RULES.md)).

## Seeding

`prisma/seed.ts` is idempotent and seeds:

- The four station categories.
- Development accounts **only** when `SEED_DEVELOPMENT_DATA=true` and
  `NODE_ENV!==production`.
- Three clearly-labeled sample clubs with stations, hours and pricing.

## Local operations

```bash
npm run db:migrate:dev --workspace @cyberbook/api   # create/apply a migration in dev
npm run db:migrate --workspace @cyberbook/api        # apply migrations (deploy)
npm run db:seed --workspace @cyberbook/api           # seed
npm run db:reset --workspace @cyberbook/api          # drop + recreate + migrate
npm run prisma:studio --workspace @cyberbook/api     # browse data
```
