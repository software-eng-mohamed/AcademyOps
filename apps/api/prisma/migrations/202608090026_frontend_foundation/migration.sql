ALTER TABLE users
  ALTER COLUMN preferred_locale DROP DEFAULT,
  ALTER COLUMN preferred_locale DROP NOT NULL,
  ADD COLUMN onboarding_completed_at timestamptz(6);

ALTER TABLE users
  ADD CONSTRAINT users_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('ar', 'en'));

CREATE TABLE user_recent_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  entity_type varchar(40) NOT NULL,
  entity_id uuid NOT NULL,
  last_viewed_at timestamptz(6) NOT NULL DEFAULT now(),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT user_recent_entities_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT user_recent_entities_resource_key UNIQUE (organization_id, user_id, entity_type, entity_id),
  CONSTRAINT user_recent_entities_user_fk FOREIGN KEY (organization_id, user_id)
    REFERENCES users (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX user_recent_entities_recent_idx
  ON user_recent_entities (organization_id, user_id, last_viewed_at DESC);

CREATE TABLE user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  event_key varchar(160) NOT NULL,
  type varchar(60) NOT NULL,
  subject_type varchar(40),
  subject_id uuid,
  payload jsonb NOT NULL,
  read_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT user_notifications_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT user_notifications_event_key UNIQUE (organization_id, user_id, event_key),
  CONSTRAINT user_notifications_user_fk FOREIGN KEY (organization_id, user_id)
    REFERENCES users (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX user_notifications_inbox_idx
  ON user_notifications (organization_id, user_id, read_at, created_at DESC);
