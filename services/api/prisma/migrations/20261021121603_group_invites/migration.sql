-- AlterTable
ALTER TABLE "group_booking_participants" ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "declined_at" TIMESTAMP(3),
ADD COLUMN     "invite_expires_at" TIMESTAMP(3),
ADD COLUMN     "invite_token_hash" VARCHAR(128),
ADD COLUMN     "invited_at" TIMESTAMP(3),
ADD COLUMN     "role" VARCHAR(20) NOT NULL DEFAULT 'MEMBER';

-- CreateIndex
CREATE INDEX "group_booking_participants_invite_token_hash_idx" ON "group_booking_participants"("invite_token_hash");
