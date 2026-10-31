ALTER TABLE branches
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT branches_version_check CHECK (version >= 1);

ALTER TABLE users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT users_version_check CHECK (version >= 1),
  ADD CONSTRAINT users_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED')),
  ADD CONSTRAINT users_locale_check CHECK (preferred_locale IN ('ar', 'en'));

ALTER TABLE roles
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT roles_version_check CHECK (version >= 1);

ALTER TABLE role_permission_grants
  ADD CONSTRAINT role_permission_grants_scope_check CHECK (scope IN ('O', 'B', 'A', 'S'));

CREATE UNIQUE INDEX user_role_assignments_active_key
  ON user_role_assignments (organization_id, user_id, role_id)
  WHERE ends_at IS NULL;

CREATE OR REPLACE FUNCTION protect_last_active_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_organization_id uuid;
  target_user_id uuid;
  owner_role_id uuid;
  remaining_owners integer;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF OLD.status <> 'ACTIVE' OR NEW.status = 'ACTIVE' THEN
      RETURN NEW;
    END IF;
    target_organization_id := OLD.organization_id;
    target_user_id := OLD.id;
  ELSE
    IF TG_OP = 'UPDATE' AND
       (OLD.ends_at IS NOT NULL OR NEW.ends_at IS NULL OR NEW.ends_at > CURRENT_TIMESTAMP) THEN
      RETURN NEW;
    END IF;
    target_organization_id := OLD.organization_id;
    target_user_id := OLD.user_id;
  END IF;

  SELECT id INTO owner_role_id
  FROM roles
  WHERE organization_id = target_organization_id AND code = 'OWNER';

  IF owner_role_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM user_role_assignments
    WHERE organization_id = target_organization_id
      AND user_id = target_user_id
      AND role_id = owner_role_id
      AND starts_at <= CURRENT_TIMESTAMP
      AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT count(*) INTO remaining_owners
  FROM users u
  JOIN user_role_assignments ura
    ON ura.organization_id = u.organization_id AND ura.user_id = u.id
  WHERE u.organization_id = target_organization_id
    AND u.id <> target_user_id
    AND u.status = 'ACTIVE'
    AND ura.role_id = owner_role_id
    AND ura.starts_at <= CURRENT_TIMESTAMP
    AND (ura.ends_at IS NULL OR ura.ends_at > CURRENT_TIMESTAMP);

  IF remaining_owners = 0 THEN
    RAISE EXCEPTION 'The last active Owner cannot be removed or suspended'
      USING ERRCODE = '23514', CONSTRAINT = 'last_active_owner_required';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_protect_last_owner
BEFORE UPDATE OF status ON users
FOR EACH ROW EXECUTE FUNCTION protect_last_active_owner();

CREATE TRIGGER user_role_assignments_protect_last_owner
BEFORE UPDATE OF ends_at OR DELETE ON user_role_assignments
FOR EACH ROW EXECUTE FUNCTION protect_last_active_owner();
