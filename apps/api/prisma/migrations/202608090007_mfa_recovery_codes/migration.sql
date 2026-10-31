CREATE TABLE mfa_recovery_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code_hash varchar(128) NOT NULL,
  used_at timestamptz(6),
  revoked_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mfa_recovery_codes_pkey PRIMARY KEY (id),
  CONSTRAINT mfa_recovery_codes_code_hash_key UNIQUE (code_hash)
);

CREATE UNIQUE INDEX mfa_recovery_codes_organization_id_id_key
  ON mfa_recovery_codes (organization_id, id);

CREATE INDEX mfa_recovery_codes_user_state_idx
  ON mfa_recovery_codes (organization_id, user_id, used_at, revoked_at);

ALTER TABLE mfa_recovery_codes
  ADD CONSTRAINT mfa_recovery_codes_user_fk
  FOREIGN KEY (organization_id, user_id)
  REFERENCES users (organization_id, id)
  ON DELETE RESTRICT;
