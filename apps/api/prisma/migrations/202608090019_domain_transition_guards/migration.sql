CREATE OR REPLACE FUNCTION validate_program_version_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Program versions must start as draft'
        USING ERRCODE = '23514', CONSTRAINT = 'program_version_initial_state';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'PUBLISHED') OR
    (OLD.status = 'PUBLISHED' AND NEW.status = 'ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'Invalid program version state transition'
      USING ERRCODE = '23514', CONSTRAINT = 'program_version_state_transition';
  END IF;
  IF NEW.status = 'PUBLISHED' AND NOT EXISTS (
    SELECT 1 FROM program_version_modules module
    WHERE module.organization_id = NEW.organization_id
      AND module.program_version_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Published program version requires curriculum'
      USING ERRCODE = '23514', CONSTRAINT = 'program_version_curriculum_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER program_versions_lifecycle_guard
BEFORE INSERT OR UPDATE OF status ON program_versions
FOR EACH ROW EXECUTE FUNCTION validate_program_version_lifecycle();

CREATE OR REPLACE FUNCTION validate_cohort_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Cohorts must start as draft'
        USING ERRCODE = '23514', CONSTRAINT = 'cohort_initial_state';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('PLANNED', 'CANCELLED')) OR
    (OLD.status = 'PLANNED' AND NEW.status IN ('ACTIVE', 'CANCELLED')) OR
    (OLD.status = 'ACTIVE' AND NEW.status IN ('COMPLETED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid cohort state transition'
      USING ERRCODE = '23514', CONSTRAINT = 'cohort_state_transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cohorts_lifecycle_guard
BEFORE INSERT OR UPDATE OF status ON cohorts
FOR EACH ROW EXECUTE FUNCTION validate_cohort_lifecycle();

CREATE OR REPLACE FUNCTION validate_lead_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'NEW' THEN
      RAISE EXCEPTION 'Leads must start as new'
        USING ERRCODE = '23514', CONSTRAINT = 'lead_initial_state';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state = OLD.state THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.state = 'NEW' AND NEW.state IN ('OPEN', 'LOST', 'DISQUALIFIED')) OR
    (OLD.state = 'OPEN' AND NEW.state IN ('QUALIFIED', 'LOST', 'DISQUALIFIED')) OR
    (OLD.state = 'QUALIFIED' AND NEW.state IN ('WON', 'LOST', 'DISQUALIFIED')) OR
    (OLD.state IN ('LOST', 'DISQUALIFIED') AND NEW.state = 'OPEN')
  ) THEN
    RAISE EXCEPTION 'Invalid lead state transition'
      USING ERRCODE = '23514', CONSTRAINT = 'lead_state_transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_lifecycle_guard
BEFORE INSERT OR UPDATE OF state ON leads
FOR EACH ROW EXECUTE FUNCTION validate_lead_lifecycle();

CREATE OR REPLACE FUNCTION validate_module_retake_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'REQUESTED' THEN
      RAISE EXCEPTION 'Module retakes must start requested'
        USING ERRCODE = '23514', CONSTRAINT = 'module_retake_initial_state';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF OLD.status <> 'REQUESTED' OR NEW.status NOT IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid module retake state transition'
      USING ERRCODE = '23514', CONSTRAINT = 'module_retake_state_transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER module_retakes_lifecycle_guard
BEFORE INSERT OR UPDATE OF status ON module_retakes
FOR EACH ROW EXECUTE FUNCTION validate_module_retake_lifecycle();

CREATE OR REPLACE FUNCTION protect_module_retake_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Module retakes cannot be deleted';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id
    OR NEW.program_version_module_id IS DISTINCT FROM OLD.program_version_module_id
    OR NEW.target_cohort_module_id IS DISTINCT FROM OLD.target_cohort_module_id
    OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'Module retake identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER module_retakes_identity_guard
BEFORE UPDATE OR DELETE ON module_retakes
FOR EACH ROW EXECUTE FUNCTION protect_module_retake_identity();

CREATE OR REPLACE FUNCTION validate_business_account_archive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF OLD.status = 'ARCHIVED' OR NEW.status <> 'ARCHIVED' THEN
    RAISE EXCEPTION 'Invalid business account state transition'
      USING ERRCODE = '23514', CONSTRAINT = 'business_account_state_transition';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM billing_accounts billing
    JOIN enrollments enrollment
      ON enrollment.organization_id = billing.organization_id
     AND enrollment.billing_account_id = billing.id
    WHERE billing.organization_id = NEW.organization_id
      AND billing.business_account_id = NEW.id
      AND enrollment.state IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'POSTPONED')
  ) THEN
    RAISE EXCEPTION 'Business account has non-terminal enrollments'
      USING ERRCODE = '23514', CONSTRAINT = 'business_account_active_enrollment';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_accounts_archive_guard
BEFORE UPDATE OF status ON business_accounts
FOR EACH ROW EXECUTE FUNCTION validate_business_account_archive();
