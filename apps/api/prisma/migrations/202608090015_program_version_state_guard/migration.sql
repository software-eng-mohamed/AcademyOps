CREATE OR REPLACE FUNCTION protect_published_program_curriculum()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'program_versions' THEN
    IF OLD.status = 'PUBLISHED' AND NEW.status NOT IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'Published program version cannot return to draft'
        USING ERRCODE = '23514', CONSTRAINT = 'program_version_state_transition';
    END IF;
    IF OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED' THEN
      RAISE EXCEPTION 'Archived program version cannot change state'
        USING ERRCODE = '23514', CONSTRAINT = 'program_version_state_transition';
    END IF;
    IF OLD.status IN ('PUBLISHED', 'ARCHIVED') AND (
      NEW.program_id IS DISTINCT FROM OLD.program_id OR
      NEW.version IS DISTINCT FROM OLD.version OR
      NEW.effective_from IS DISTINCT FROM OLD.effective_from
    ) THEN
      RAISE EXCEPTION 'Published program version identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status
  FROM program_versions
  WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
    AND id = COALESCE(NEW.program_version_id, OLD.program_version_id);

  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Published program curriculum is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
