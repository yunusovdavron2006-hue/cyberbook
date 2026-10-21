# Booking Rules

This is the contract of the booking engine (`bookings.service.ts`,
`pricing.service.ts`, `club-schedule.service.ts`, `booking-state.ts`). All times
are UTC instants; all intervals are half-open `[startsAt, endsAt)`.

## Creating a booking — validation order

`POST /bookings` validates, in order, and rejects with the first failure:

1. `startsAt`/`endsAt` must be valid ISO-8601 timestamps.
2. `endsAt` must be strictly after `startsAt`.
3. Duration must be a whole multiple of **30 minutes**.
4. Duration ≥ `BOOKING_MIN_DURATION_MINUTES` (default 30).
5. Duration ≤ `BOOKING_MAX_DURATION_MINUTES` (default 720 = 12h).
6. `startsAt` must not be in the past (1-minute grace).
7. `startsAt` ≥ now + `BOOKING_LEAD_TIME_MINUTES`.
8. `startsAt` ≤ now + `BOOKING_MAX_HORIZON_DAYS` (default 30).
9. Club exists and `status === APPROVED` (else `CLUB_NOT_BOOKABLE`).
10. Station exists in that club and `status === ACTIVE` (else `STATION_UNAVAILABLE`).
11. The time must fall inside the club's operating hours for that club-local date
    (else `OUTSIDE_OPERATING_HOURS`) — respects overnight shifts and special
    closures.

## Price

The **server** computes the price; a client-supplied price is never trusted.
`PricingService.computePrice` resolves the effective rate and returns a snapshot
that is stored on the booking:

- Precedence: **station rule → category rule → station base price**.
- Within a level, higher `priority` wins; ties break by newer rule id.
- `PER_HOUR` total = `round((rate × minutes) / 60)` in integer so'm (half-up).
- `FLAT` is a fixed amount.
- Snapshot records `basePricePerHour`, `resolvedRate`, `unit`, `source`,
  `ruleId`, `ruleName`, `minutes`, `total`, `currency`, `computedAt`.

## Status & auto-confirm

- If `BOOKING_AUTO_CONFIRM` is not `false` (default), a new booking is created as
  **`CONFIRMED`**.
- Otherwise it is created as **`PENDING`** with `expiresAt = now + PENDING_TTL_MINUTES`
  (default 15).
- A `PENDING` booking is released by the scheduler once `expiresAt` passes →
  `EXPIRED`, freeing the slot.

**Blocking statuses** (occupy a station): `PENDING`, `CONFIRMED`.
**Non-blocking**: `CANCELLED`, `COMPLETED`, `NO_SHOW`, `EXPIRED`.

Allowed status transitions are defined in `booking-state.ts` (`ALLOWED_TRANSITIONS`).
An invalid transition returns `INVALID_TRANSITION` (409).

## Concurrency & overlap

Two guarantees prevent double-booking the same station:

1. **Application lock** — inside the create transaction,
   `pg_advisory_xact_lock(stationId)` serializes concurrent creates for that
   station, then an overlap query checks existing blocking bookings (widened by
   `BOOKING_BUFFER_MINUTES` on each side). Overlap → `SLOT_TAKEN` (409).
2. **Database exclusion constraint** — `bookings_no_overlap_per_station` (GiST)
   makes an overlapping `PENDING`/`CONFIRMED` row physically impossible, even if
   application logic is bypassed.

Maintenance blocks that intersect the requested window are also rejected
(`STATION_MAINTENANCE`).

## Idempotency

`POST /bookings` accepts an optional `idempotencyKey`. It is unique per user
(`@@unique([userId, idempotencyKey])`):

- If a booking with the same key already exists, the existing booking is returned
  with `idempotentReplay: true`.
- If two requests race, the unique violation (`P2002`) is caught and the existing
  booking is returned. The client can safely retry.

The web and mobile clients generate a random UUID per booking attempt.

## Cancellation

- Only `PENDING`/`CONFIRMED` bookings can be cancelled (else `NOT_CANCELLABLE`).
- A **customer** may cancel until `startsAt − CANCELLATION_DEADLINE_MINUTES`
  (default 30). Owners/staff/admins are not bound by the deadline.
- Cancelling writes a `booking_event` and notifies the user (and owner if staff
  cancelled).

## Check-in

Staff may check in a `CONFIRMED` booking; this transitions it directly to
`COMPLETED` and records a `CHECKED_IN` event. Only confirmed bookings are eligible.

## Scheduler jobs

`BookingScheduler` (`@nestjs/schedule`) runs periodically:

- **Expire PENDING** — `PENDING` + `expiresAt < now` → `EXPIRED`, batched (200).
- **Reminders** — `CONFIRMED` bookings starting within 60 minutes receive a
  one-time reminder, de-duplicated via a `REMINDER_SENT` booking event.

## Configurable knobs (environment)

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `PENDING_TTL_MINUTES` | 15 | Pending hold lifetime |
| `CANCELLATION_DEADLINE_MINUTES` | 30 | Customer cancel cutoff before start |
| `BOOKING_MIN_DURATION_MINUTES` | 30 | Minimum length |
| `BOOKING_MAX_DURATION_MINUTES` | 720 | Maximum length |
| `BOOKING_LEAD_TIME_MINUTES` | 0 | Minimum advance notice |
| `BOOKING_BUFFER_MINUTES` | 0 | Turnaround buffer between bookings |
| `BOOKING_AUTO_CONFIRM` | true | Confirm immediately vs. pending |
| `BOOKING_MAX_HORIZON_DAYS` | 30 | How far ahead bookings are allowed |

## Occupancy (dashboard)

The club dashboard estimates occupancy as booked minutes ÷ (active stations ×
14 operating hours). 14 hours is a **documented assumption**, not derived from
the club's actual hours; treat the percentage as an approximation.
