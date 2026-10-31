ALTER TABLE "mfa_factors"
  ADD COLUMN "last_used_counter" BIGINT;

COMMENT ON COLUMN "mfa_factors"."last_used_counter" IS
  'Highest accepted TOTP time-step; prevents replay within and across acceptance windows.';
