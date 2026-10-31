INSERT INTO permissions (code, description)
VALUES
  ('messaging.otp.read', 'Read the WhatsApp OTP channel health and pairing state'),
  ('messaging.otp.manage', 'Connect, disconnect, disable, or reset the WhatsApp OTP channel')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permission_grants (
  id,
  organization_id,
  role_id,
  permission_code,
  scope
)
SELECT gen_random_uuid(), roles.organization_id, roles.id, permission.code, 'O'
FROM roles
CROSS JOIN (
  VALUES ('messaging.otp.read'), ('messaging.otp.manage')
) AS permission(code)
WHERE roles.code = 'OWNER'
ON CONFLICT (organization_id, role_id, permission_code, scope) DO NOTHING;

CREATE TABLE whatsapp_otp_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  provider varchar(30) NOT NULL DEFAULT 'BAILEYS',
  enabled boolean NOT NULL DEFAULT false,
  desired_state varchar(30) NOT NULL DEFAULT 'DISCONNECTED',
  state varchar(30) NOT NULL DEFAULT 'DISABLED',
  phone_masked varchar(30),
  last_error_code varchar(80),
  last_connected_at timestamptz(6),
  last_disconnected_at timestamptz(6),
  last_heartbeat_at timestamptz(6),
  qr_expires_at timestamptz(6),
  command_version integer NOT NULL DEFAULT 0,
  handled_command_version integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT whatsapp_otp_channels_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_otp_channels_org_fk FOREIGN KEY (organization_id)
    REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_otp_channels_provider_check CHECK (provider = 'BAILEYS'),
  CONSTRAINT whatsapp_otp_channels_desired_state_check
    CHECK (desired_state IN ('CONNECTED', 'DISCONNECTED', 'LOGGED_OUT')),
  CONSTRAINT whatsapp_otp_channels_state_check
    CHECK (state IN ('DISABLED', 'STARTING', 'QR_REQUIRED', 'CONNECTED', 'DISCONNECTED', 'FAULTED')),
  CONSTRAINT whatsapp_otp_channels_command_check
    CHECK (command_version >= 0 AND handled_command_version >= 0 AND handled_command_version <= command_version),
  CONSTRAINT whatsapp_otp_channels_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX whatsapp_otp_channels_organization_id_key
  ON whatsapp_otp_channels (organization_id);
CREATE UNIQUE INDEX whatsapp_otp_channels_organization_id_id_key
  ON whatsapp_otp_channels (organization_id, id);
CREATE INDEX whatsapp_otp_channels_enabled_desired_updated_idx
  ON whatsapp_otp_channels (enabled, desired_state, updated_at);

CREATE TABLE whatsapp_auth_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  category varchar(80) NOT NULL,
  key_id varchar(190) NOT NULL,
  value_cipher text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT whatsapp_auth_records_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_auth_records_org_fk FOREIGN KEY (organization_id)
    REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_auth_records_category_check CHECK (length(btrim(category)) > 0),
  CONSTRAINT whatsapp_auth_records_key_check CHECK (length(btrim(key_id)) > 0),
  CONSTRAINT whatsapp_auth_records_cipher_check CHECK (length(value_cipher) > 32),
  CONSTRAINT whatsapp_auth_records_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX whatsapp_auth_records_organization_id_id_key
  ON whatsapp_auth_records (organization_id, id);
CREATE UNIQUE INDEX whatsapp_auth_records_org_category_key_uq
  ON whatsapp_auth_records (organization_id, category, key_id);
CREATE INDEX whatsapp_auth_records_org_category_idx
  ON whatsapp_auth_records (organization_id, category);

CREATE OR REPLACE FUNCTION whatsapp_otp_channel_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR NEW.provider <> OLD.provider THEN
    RAISE EXCEPTION 'WhatsApp OTP channel identity is immutable';
  END IF;
  IF NEW.command_version < OLD.command_version OR NEW.handled_command_version < OLD.handled_command_version THEN
    RAISE EXCEPTION 'WhatsApp OTP command versions cannot decrease';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER whatsapp_otp_channel_guard_trigger
BEFORE UPDATE ON whatsapp_otp_channels
FOR EACH ROW EXECUTE FUNCTION whatsapp_otp_channel_guard();
