-- Alter User and StudentProfile status constraints to include REJECTED
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'));

ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_portal_status_check;
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_portal_status_check CHECK (portal_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'));

-- CreateTable
CREATE TABLE student_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  person_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  submitted_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamptz(6),
  reviewed_by_user_id uuid,
  rejection_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT student_registrations_pkey PRIMARY KEY (id),
  CONSTRAINT student_registrations_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT student_registrations_version_check CHECK (version > 0),
  CONSTRAINT student_registrations_review_fields_check CHECK (
    (status = 'PENDING' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL AND rejection_reason IS NULL) OR
    (status = 'APPROVED' AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND rejection_reason IS NULL) OR
    (status = 'REJECTED' AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND rejection_reason IS NOT NULL AND length(trim(rejection_reason)) >= 5 AND length(rejection_reason) <= 500)
  )
);

-- CreateIndexes
CREATE UNIQUE INDEX student_registrations_organization_id_id_key
  ON student_registrations (organization_id, id);

CREATE INDEX student_registrations_organization_id_status_idx
  ON student_registrations (organization_id, status);

-- Add unique tenant/person and tenant/user constraints
ALTER TABLE student_registrations
  ADD CONSTRAINT student_registrations_org_person_uq UNIQUE (organization_id, person_id);

ALTER TABLE student_registrations
  ADD CONSTRAINT student_registrations_org_user_uq UNIQUE (organization_id, user_id);

-- Add foreign keys
ALTER TABLE student_registrations
  ADD CONSTRAINT student_registrations_organization_fk
  FOREIGN KEY (organization_id)
  REFERENCES organizations (id)
  ON DELETE RESTRICT;

ALTER TABLE student_registrations
  ADD CONSTRAINT student_registrations_person_fk
  FOREIGN KEY (organization_id, person_id)
  REFERENCES persons (organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE student_registrations
  ADD CONSTRAINT student_registrations_user_fk
  FOREIGN KEY (organization_id, user_id)
  REFERENCES users (organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE student_registrations
  ADD CONSTRAINT student_registrations_reviewer_fk
  FOREIGN KEY (organization_id, reviewed_by_user_id)
  REFERENCES users (organization_id, id)
  ON DELETE RESTRICT;

-- Add active user-role-assignment unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS user_role_assignments_org_user_role_active_idx
  ON user_role_assignments (organization_id, user_id, role_id)
  WHERE ends_at IS NULL;

-- Add active login-identifier uniqueness invariant
CREATE UNIQUE INDEX IF NOT EXISTS user_login_identifiers_org_type_val_active_idx
  ON user_login_identifiers (organization_id, type, normalized_value)
  WHERE revoked_at IS NULL;

-- Insert Permission row
INSERT INTO permissions (code, description, created_at)
VALUES ('students.registration.manage', 'Manage student self-registrations (list, read, approve, reject)', NOW())
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

-- Grant Permission to OWNER role
INSERT INTO role_permission_grants (id, organization_id, role_id, permission_code, scope, created_at)
SELECT gen_random_uuid(), organization_id, id, 'students.registration.manage', 'O', NOW()
FROM roles
WHERE code = 'OWNER'
ON CONFLICT (organization_id, role_id, permission_code, scope) DO NOTHING;

-- Remove it from all non-OWNER roles
DELETE FROM role_permission_grants rpg
USING roles r
WHERE rpg.role_id = r.id
  AND rpg.organization_id = r.organization_id
  AND rpg.permission_code = 'students.registration.manage'
  AND r.code <> 'OWNER';

-- Trigger: Guard legal registration status transitions
CREATE OR REPLACE FUNCTION guard_student_registration_transitions()
RETURNS trigger AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    IF OLD.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Only transitions from PENDING status are allowed'
        USING ERRCODE = '23514', CONSTRAINT = 'legal_registration_state_transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_registration_status_transition_guard ON student_registrations;
CREATE TRIGGER student_registration_status_transition_guard
  BEFORE UPDATE ON student_registrations
  FOR EACH ROW EXECUTE FUNCTION guard_student_registration_transitions();

-- Trigger: Prevent future non-OWNER grants
CREATE OR REPLACE FUNCTION guard_owner_only_registration_permissions()
RETURNS trigger AS $$
DECLARE
  role_code varchar(50);
BEGIN
  IF NEW.permission_code = 'students.registration.manage' THEN
    SELECT code INTO role_code
    FROM roles
    WHERE id = NEW.role_id AND organization_id = NEW.organization_id;

    IF role_code IS NULL OR role_code <> 'OWNER' THEN
      RAISE EXCEPTION 'Student registration management permission is exclusive to the OWNER role'
        USING ERRCODE = '23514', CONSTRAINT = 'owner_only_registration_permissions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS role_permission_grants_owner_only_registration_permissions ON role_permission_grants;
CREATE TRIGGER role_permission_grants_owner_only_registration_permissions
  BEFORE INSERT OR UPDATE ON role_permission_grants
  FOR EACH ROW EXECUTE FUNCTION guard_owner_only_registration_permissions();
