CREATE OR REPLACE FUNCTION protect_last_active_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_organization_id uuid;
  target_user_id uuid;
  owner_role_id uuid;
  remaining_owners integer;
  checked_at timestamptz := clock_timestamp();
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF OLD.status <> 'ACTIVE' OR NEW.status = 'ACTIVE' THEN
      RETURN NEW;
    END IF;
    target_organization_id := OLD.organization_id;
    target_user_id := OLD.id;
  ELSE
    IF TG_OP = 'UPDATE' AND
       (OLD.ends_at IS NOT NULL OR NEW.ends_at IS NULL OR NEW.ends_at > checked_at) THEN
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
      AND starts_at <= checked_at
      AND (ends_at IS NULL OR ends_at > checked_at)
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
    AND ura.starts_at <= checked_at
    AND (ura.ends_at IS NULL OR ura.ends_at > checked_at);

  IF remaining_owners = 0 THEN
    RAISE EXCEPTION 'The last active Owner cannot be removed or suspended'
      USING ERRCODE = '23514', CONSTRAINT = 'last_active_owner_required';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
