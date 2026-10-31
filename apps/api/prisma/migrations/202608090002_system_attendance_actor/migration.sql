-- Automated roster closure creates auditable attendance events without impersonating a user.
ALTER TABLE "attendance_events" ALTER COLUMN "actor_user_id" DROP NOT NULL;
