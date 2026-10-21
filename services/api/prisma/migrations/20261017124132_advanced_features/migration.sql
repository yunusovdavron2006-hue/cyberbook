-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "LoyaltyEntryType" AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'REVERSAL', 'EXPIRE');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GroupBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PARTIALLY_CANCELLED', 'CANCELLED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionBillingPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'CHARGED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('GENERAL', 'BOOKING', 'PAYMENT', 'CLUB', 'ACCOUNT', 'TECHNICAL', 'COMPLAINT', 'REFUND');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LOYALTY_EARNED';
ALTER TYPE "NotificationType" ADD VALUE 'LOYALTY_REDEEMED';
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_REWARDED';
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_BOOKING_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_CHARGED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "group_id" INTEGER;

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "assigned_to_id" INTEGER,
ADD COLUMN     "booking_id" INTEGER,
ADD COLUMN     "category" "TicketCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "club_id" INTEGER,
ADD COLUMN     "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "support_ticket_events" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER,
    "type" VARCHAR(40) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER NOT NULL,
    "created_by_id" INTEGER,
    "code" VARCHAR(40),
    "name" VARCHAR(140) NOT NULL,
    "description" VARCHAR(500),
    "type" "PromotionType" NOT NULL,
    "value" BIGINT NOT NULL,
    "station_id" INTEGER,
    "category_id" INTEGER,
    "day_of_weeks" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "starts_at_time" VARCHAR(5),
    "ends_at_time" VARCHAR(5),
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "min_duration_minutes" INTEGER,
    "max_uses_total" INTEGER,
    "max_uses_per_user" INTEGER,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemptions" (
    "id" SERIAL NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "booking_id" INTEGER,
    "club_id" INTEGER NOT NULL,
    "code" VARCHAR(40),
    "discount_amount" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_tokens" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_by_id" INTEGER,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_ledger_entries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "LoyaltyEntryType" NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "booking_id" INTEGER,
    "referral_id" INTEGER,
    "actor_user_id" INTEGER,
    "idempotency_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" SERIAL NOT NULL,
    "referrer_user_id" INTEGER NOT NULL,
    "referred_user_id" INTEGER NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "qualifying_booking_id" INTEGER,
    "reward_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualified_at" TIMESTAMP(3),
    "rewarded_at" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_bookings" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "club_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "status" "GroupBookingStatus" NOT NULL DEFAULT 'PENDING',
    "seats_requested" INTEGER NOT NULL,
    "seats_confirmed" INTEGER NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "notes" VARCHAR(500),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_booking_participants" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "name" VARCHAR(120),
    "email" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_booking_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER,
    "kind" VARCHAR(40) NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "provider" VARCHAR(40) NOT NULL DEFAULT 'heuristic',
    "model" VARCHAR(80),
    "payload" JSONB NOT NULL,
    "generated_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "price_amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "billing_period" "SubscriptionBillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "commission_bps" INTEGER NOT NULL DEFAULT 0,
    "max_stations" INTEGER,
    "features" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_subscriptions" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_ends_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_ledger_entries" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER NOT NULL,
    "booking_id" INTEGER,
    "payment_id" INTEGER,
    "base_amount" BIGINT NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "commission_amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "reverses_id" INTEGER,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_ticket_events_ticket_id_idx" ON "support_ticket_events"("ticket_id");

-- CreateIndex
CREATE INDEX "promotions_club_id_active_idx" ON "promotions"("club_id", "active");

-- CreateIndex
CREATE INDEX "promotions_station_id_idx" ON "promotions"("station_id");

-- CreateIndex
CREATE INDEX "promotions_category_id_idx" ON "promotions"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_club_id_code_key" ON "promotions"("club_id", "code");

-- CreateIndex
CREATE INDEX "promotion_redemptions_promotion_id_user_id_idx" ON "promotion_redemptions"("promotion_id", "user_id");

-- CreateIndex
CREATE INDEX "promotion_redemptions_user_id_created_at_idx" ON "promotion_redemptions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_redemptions_promotion_id_booking_id_key" ON "promotion_redemptions"("promotion_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_tokens_booking_id_key" ON "check_in_tokens"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_tokens_token_hash_key" ON "check_in_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_ledger_entries_idempotency_key_key" ON "loyalty_ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "loyalty_ledger_entries_user_id_created_at_idx" ON "loyalty_ledger_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_ledger_entries_user_id_type_idx" ON "loyalty_ledger_entries"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_user_id_key" ON "referrals"("referred_user_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_user_id_status_idx" ON "referrals"("referrer_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referrer_user_id_referred_user_id_key" ON "referrals"("referrer_user_id", "referred_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_bookings_reference_key" ON "group_bookings"("reference");

-- CreateIndex
CREATE INDEX "group_bookings_club_id_starts_at_idx" ON "group_bookings"("club_id", "starts_at");

-- CreateIndex
CREATE INDEX "group_bookings_user_id_created_at_idx" ON "group_bookings"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "group_bookings_user_id_idempotency_key_key" ON "group_bookings"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "group_booking_participants_group_id_idx" ON "group_booking_participants"("group_id");

-- CreateIndex
CREATE INDEX "ai_insights_club_id_kind_created_at_idx" ON "ai_insights"("club_id", "kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_key_key" ON "subscription_plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "club_subscriptions_idempotency_key_key" ON "club_subscriptions"("idempotency_key");

-- CreateIndex
CREATE INDEX "club_subscriptions_club_id_status_idx" ON "club_subscriptions"("club_id", "status");

-- CreateIndex
CREATE INDEX "club_subscriptions_status_current_period_end_idx" ON "club_subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "commission_ledger_entries_reverses_id_key" ON "commission_ledger_entries"("reverses_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_ledger_entries_idempotency_key_key" ON "commission_ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "commission_ledger_entries_club_id_created_at_idx" ON "commission_ledger_entries"("club_id", "created_at");

-- CreateIndex
CREATE INDEX "commission_ledger_entries_booking_id_idx" ON "commission_ledger_entries"("booking_id");

-- CreateIndex
CREATE INDEX "bookings_group_id_idx" ON "bookings"("group_id");

-- CreateIndex
CREATE INDEX "support_tickets_club_id_status_idx" ON "support_tickets"("club_id", "status");

-- CreateIndex
CREATE INDEX "support_tickets_assigned_to_id_status_idx" ON "support_tickets"("assigned_to_id", "status");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "station_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_tokens" ADD CONSTRAINT "check_in_tokens_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_tokens" ADD CONSTRAINT "check_in_tokens_consumed_by_id_fkey" FOREIGN KEY ("consumed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_tokens" ADD CONSTRAINT "check_in_tokens_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_bookings" ADD CONSTRAINT "group_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_bookings" ADD CONSTRAINT "group_bookings_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_booking_participants" ADD CONSTRAINT "group_booking_participants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_booking_participants" ADD CONSTRAINT "group_booking_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_ledger_entries" ADD CONSTRAINT "commission_ledger_entries_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_ledger_entries" ADD CONSTRAINT "commission_ledger_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_ledger_entries" ADD CONSTRAINT "commission_ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_ledger_entries" ADD CONSTRAINT "commission_ledger_entries_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "commission_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
