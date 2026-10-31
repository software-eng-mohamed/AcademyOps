CREATE TABLE password_reset_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash varchar(128) NOT NULL,
  expires_at timestamptz(6) NOT NULL,
  used_at timestamptz(6),
  revoked_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT password_reset_tokens_expiry_check CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX password_reset_tokens_organization_id_id_key
  ON password_reset_tokens (organization_id, id);

CREATE INDEX password_reset_tokens_user_state_idx
  ON password_reset_tokens (organization_id, user_id, used_at, revoked_at, expires_at);

ALTER TABLE password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_user_fk
  FOREIGN KEY (organization_id, user_id)
  REFERENCES users (organization_id, id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX password_reset_tokens_one_live_user
  ON password_reset_tokens (organization_id, user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION password_reset_tokens_immutable_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR
     NEW.user_id <> OLD.user_id OR
     NEW.token_hash <> OLD.token_hash OR
     NEW.expires_at <> OLD.expires_at OR
     NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Password reset token identity is immutable';
  END IF;
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'Used password reset token cannot be changed';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'Revoked password reset token cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER password_reset_tokens_immutable_identity_guard
BEFORE UPDATE ON password_reset_tokens
FOR EACH ROW EXECUTE FUNCTION password_reset_tokens_immutable_identity();
