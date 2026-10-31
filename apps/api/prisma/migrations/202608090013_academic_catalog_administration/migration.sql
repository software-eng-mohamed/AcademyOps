ALTER TABLE programs
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT programs_version_check CHECK (version >= 1),
  ADD CONSTRAINT programs_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED'));

ALTER TABLE program_versions
  ADD COLUMN record_version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT program_versions_record_version_check CHECK (record_version >= 1),
  ADD CONSTRAINT program_versions_number_check CHECK (version >= 1),
  ADD CONSTRAINT program_versions_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  ADD CONSTRAINT program_versions_dates_check CHECK (
    effective_to IS NULL OR (effective_from IS NOT NULL AND effective_to >= effective_from)
  );

ALTER TABLE modules
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT modules_version_check CHECK (version >= 1);

ALTER TABLE rooms
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT rooms_version_check CHECK (version >= 1);

ALTER TABLE trainer_profiles
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT trainer_profiles_version_check CHECK (version >= 1),
  ADD CONSTRAINT trainer_profiles_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE cohorts
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT cohorts_version_check CHECK (version >= 1),
  ADD CONSTRAINT cohorts_status_check CHECK (
    status IN ('DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')
  ),
  ADD CONSTRAINT cohorts_dates_check CHECK (
    ends_on IS NULL OR (starts_on IS NOT NULL AND ends_on >= starts_on)
  ),
  ADD CONSTRAINT cohorts_capacity_check CHECK (capacity IS NULL OR capacity > 0);

ALTER TABLE program_version_modules
  ADD CONSTRAINT program_version_modules_ordinal_check CHECK (ordinal > 0);

ALTER TABLE cohort_modules
  ADD CONSTRAINT cohort_modules_ordinal_check CHECK (ordinal > 0);

CREATE UNIQUE INDEX program_versions_one_draft
  ON program_versions (organization_id, program_id)
  WHERE status = 'DRAFT';

CREATE OR REPLACE FUNCTION protect_published_program_curriculum()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'program_versions' THEN
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

CREATE TRIGGER program_versions_published_identity_guard
BEFORE UPDATE ON program_versions
FOR EACH ROW EXECUTE FUNCTION protect_published_program_curriculum();

CREATE TRIGGER program_version_modules_draft_only_guard
BEFORE INSERT OR UPDATE OR DELETE ON program_version_modules
FOR EACH ROW EXECUTE FUNCTION protect_published_program_curriculum();

CREATE OR REPLACE FUNCTION validate_active_cohort_program_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM program_versions pv
    WHERE pv.organization_id = NEW.organization_id
      AND pv.id = NEW.program_version_id
      AND pv.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Active cohort requires a published program version'
      USING ERRCODE = '23514', CONSTRAINT = 'cohort_published_program_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cohorts_published_program_guard
BEFORE INSERT OR UPDATE OF status, program_version_id ON cohorts
FOR EACH ROW EXECUTE FUNCTION validate_active_cohort_program_version();
