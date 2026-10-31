CREATE UNIQUE INDEX IF NOT EXISTS user_login_identifiers_org_user_id_uq
  ON user_login_identifiers (organization_id, user_id, id);

CREATE TABLE phone_otp_challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  phone_identifier_id uuid NOT NULL,
  normalized_phone varchar(50) NOT NULL,
  code_hash varchar(128) NOT NULL,
  expires_at timestamptz(6) NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz(6),
  revoked_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT phone_otp_challenges_pkey PRIMARY KEY (id),
  CONSTRAINT phone_otp_challenges_attempts_check CHECK (attempts >= 0 AND attempts <= 5),
  CONSTRAINT phone_otp_challenges_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT phone_otp_challenges_consumed_revoked_check CHECK (NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX phone_otp_challenges_organization_id_id_key
  ON phone_otp_challenges (organization_id, id);

CREATE INDEX phone_otp_challenges_user_state_idx
  ON phone_otp_challenges (organization_id, user_id, consumed_at, revoked_at, expires_at);

CREATE INDEX phone_otp_challenges_phone_state_idx
  ON phone_otp_challenges (organization_id, normalized_phone, consumed_at, revoked_at, expires_at);

ALTER TABLE phone_otp_challenges
  ADD CONSTRAINT phone_otp_challenges_user_fk
  FOREIGN KEY (organization_id, user_id)
  REFERENCES users (organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE phone_otp_challenges
  ADD CONSTRAINT phone_otp_challenges_identifier_fk
  FOREIGN KEY (organization_id, user_id, phone_identifier_id)
  REFERENCES user_login_identifiers (organization_id, user_id, id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX phone_otp_challenges_one_live_challenge
  ON phone_otp_challenges (organization_id, user_id, normalized_phone)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION guard_phone_otp_challenge_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  id_type varchar;
  id_val varchar;
  id_revoked timestamptz;
BEGIN
  SELECT type, normalized_value, revoked_at INTO id_type, id_val, id_revoked
  FROM user_login_identifiers
  WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id AND id = NEW.phone_identifier_id;

  IF id_type IS NULL OR id_type <> 'PHONE' THEN
    RAISE EXCEPTION 'Phone OTP challenge identifier must be of type PHONE';
  END IF;

  IF id_val <> NEW.normalized_phone THEN
    RAISE EXCEPTION 'Phone OTP challenge normalized phone must match identifier';
  END IF;

  IF id_revoked IS NOT NULL THEN
    RAISE EXCEPTION 'Phone OTP challenge cannot reference revoked identifier';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER phone_otp_challenge_insert_guard
BEFORE INSERT ON phone_otp_challenges
FOR EACH ROW EXECUTE FUNCTION guard_phone_otp_challenge_insert();

CREATE OR REPLACE FUNCTION phone_otp_challenges_immutable_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR
     NEW.user_id <> OLD.user_id OR
     NEW.phone_identifier_id <> OLD.phone_identifier_id OR
     NEW.normalized_phone <> OLD.normalized_phone OR
     NEW.code_hash <> OLD.code_hash OR
     NEW.expires_at <> OLD.expires_at OR
     NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Phone OTP challenge identity is immutable';
  END IF;

  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'Phone OTP challenge attempts cannot decrease';
  END IF;

  IF NEW.attempts = 5 AND NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'Attempt 5 must be terminal and revoked';
  END IF;

  IF OLD.consumed_at IS NOT NULL AND (
    NEW.consumed_at IS DISTINCT FROM OLD.consumed_at OR
    NEW.revoked_at IS NOT NULL OR
    NEW.attempts <> OLD.attempts
  ) THEN
    RAISE EXCEPTION 'Consumed phone OTP challenge cannot be mutated';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND (
    NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR
    NEW.consumed_at IS NOT NULL OR
    NEW.attempts <> OLD.attempts
  ) THEN
    RAISE EXCEPTION 'Revoked phone OTP challenge cannot be mutated';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER phone_otp_challenges_immutable_identity_guard
BEFORE UPDATE ON phone_otp_challenges
FOR EACH ROW EXECUTE FUNCTION phone_otp_challenges_immutable_identity();
