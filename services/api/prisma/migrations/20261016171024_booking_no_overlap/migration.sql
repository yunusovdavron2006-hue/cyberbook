-- Prevent double-booking of the same station at overlapping times.
--
-- This is the database-level guarantee that complements (and is stronger than)
-- the application-level checks in BookingsService. The btree_gist extension
-- lets a GiST index mix the equality operator on station_id with the overlap
-- operator on the timestamp range. Only reservations that actually block a
-- station are considered: PENDING and CONFIRMED.
--
-- Interval convention matches the application: [starts_at, ends_at).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap_per_station"
  EXCLUDE USING gist (
    "station_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
