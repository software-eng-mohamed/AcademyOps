ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_version_check CHECK (version >= 1),
  ADD CONSTRAINT enrollments_kind_check CHECK (kind IN ('INDIVIDUAL', 'CORPORATE')),
  ADD CONSTRAINT enrollments_state_check CHECK (
    state IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'POSTPONED', 'COMPLETED', 'CANCELLED')
  );

CREATE OR REPLACE FUNCTION validate_enrollment_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM student_profiles profile
    WHERE profile.organization_id = NEW.organization_id
      AND profile.person_id = NEW.student_person_id
  ) THEN
    RAISE EXCEPTION 'Enrollment requires a student profile'
      USING ERRCODE = '23514', CONSTRAINT = 'enrollment_student_profile_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM program_versions version
    WHERE version.organization_id = NEW.organization_id
      AND version.id = NEW.program_version_id
      AND version.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Enrollment requires a published program version'
      USING ERRCODE = '23514', CONSTRAINT = 'enrollment_published_program_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM branches branch
    WHERE branch.organization_id = NEW.organization_id
      AND branch.id = NEW.home_branch_id
      AND branch.is_active
  ) THEN
    RAISE EXCEPTION 'Enrollment home branch must be active'
      USING ERRCODE = '23514', CONSTRAINT = 'enrollment_active_branch_required';
  END IF;

  IF NEW.kind = 'INDIVIDUAL' AND NOT EXISTS (
    SELECT 1 FROM billing_accounts billing
    WHERE billing.organization_id = NEW.organization_id
      AND billing.id = NEW.billing_account_id
      AND billing.kind = 'INDIVIDUAL'
      AND billing.person_id = NEW.student_person_id
  ) THEN
    RAISE EXCEPTION 'Individual enrollment billing account must belong to the student'
      USING ERRCODE = '23514', CONSTRAINT = 'enrollment_individual_billing_owner';
  END IF;

  IF NEW.kind = 'CORPORATE' AND NOT EXISTS (
    SELECT 1
    FROM billing_accounts billing
    JOIN business_accounts business
      ON business.organization_id = billing.organization_id
     AND business.id = billing.business_account_id
    WHERE billing.organization_id = NEW.organization_id
      AND billing.id = NEW.billing_account_id
      AND billing.kind = 'CORPORATE'
      AND business.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Corporate enrollment requires an active corporate billing account'
      USING ERRCODE = '23514', CONSTRAINT = 'enrollment_corporate_billing_owner';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollments_links_guard
BEFORE INSERT OR UPDATE OF organization_id, student_person_id, program_version_id,
  billing_account_id, home_branch_id, kind ON enrollments
FOR EACH ROW EXECUTE FUNCTION validate_enrollment_links();

CREATE OR REPLACE FUNCTION validate_enrollment_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = OLD.state THEN RETURN NEW; END IF;

  IF NOT (
    (OLD.state = 'DRAFT' AND NEW.state IN ('PENDING_APPROVAL', 'ACTIVE')) OR
    (OLD.state = 'PENDING_APPROVAL' AND NEW.state IN ('DRAFT', 'ACTIVE')) OR
    (OLD.state = 'ACTIVE' AND NEW.state IN ('POSTPONED', 'COMPLETED', 'CANCELLED')) OR
    (OLD.state = 'POSTPONED' AND NEW.state IN ('ACTIVE', 'COMPLETED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid enrollment state transition: % to %', OLD.state, NEW.state
      USING ERRCODE = '23514', CONSTRAINT = 'enrollment_state_transition';
  END IF;

  IF NEW.state = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM enrollment_cohort_assignments assignment
    WHERE assignment.organization_id = NEW.organization_id
      AND assignment.enrollment_id = NEW.id
      AND assignment.ends_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active enrollment requires an active cohort assignment'
      USING ERRCODE = '23514', CONSTRAINT = 'enrollment_active_assignment_required';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollments_state_transition_guard
BEFORE UPDATE OF state ON enrollments
FOR EACH ROW EXECUTE FUNCTION validate_enrollment_state_transition();

CREATE OR REPLACE FUNCTION validate_enrollment_cohort_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM enrollments enrollment
    JOIN cohorts cohort
      ON cohort.organization_id = enrollment.organization_id
     AND cohort.id = NEW.cohort_id
    WHERE enrollment.organization_id = NEW.organization_id
      AND enrollment.id = NEW.enrollment_id
      AND cohort.program_version_id = enrollment.program_version_id
      AND cohort.status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Cohort assignment must match the enrollment program version'
      USING ERRCODE = '23514', CONSTRAINT = 'enrollment_assignment_program_match';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollment_cohort_assignment_program_guard
BEFORE INSERT OR UPDATE OF organization_id, enrollment_id, cohort_id
ON enrollment_cohort_assignments
FOR EACH ROW EXECUTE FUNCTION validate_enrollment_cohort_assignment();

CREATE OR REPLACE FUNCTION protect_enrollment_cohort_assignment_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Enrollment cohort assignment history is immutable';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id
    OR NEW.cohort_id IS DISTINCT FROM OLD.cohort_id
    OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR OLD.ends_at IS NOT NULL
    OR NEW.ends_at IS NULL THEN
    RAISE EXCEPTION 'Only closing an active cohort assignment is allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollment_cohort_assignments_history_guard
BEFORE UPDATE OR DELETE ON enrollment_cohort_assignments
FOR EACH ROW EXECUTE FUNCTION protect_enrollment_cohort_assignment_history();

CREATE TRIGGER enrollment_events_append_only
BEFORE UPDATE OR DELETE ON enrollment_events
FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

ALTER TABLE module_retakes
  ADD COLUMN requested_by uuid NOT NULL,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT module_retakes_version_check CHECK (version >= 1),
  ADD CONSTRAINT module_retakes_status_check CHECK (
    status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED')
  ),
  ADD CONSTRAINT module_retakes_requester_fk
    FOREIGN KEY (organization_id, requested_by)
    REFERENCES users (organization_id, id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX module_retakes_one_open
  ON module_retakes (organization_id, enrollment_id, program_version_module_id)
  WHERE status = 'REQUESTED';

CREATE OR REPLACE FUNCTION validate_module_retake_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM enrollments enrollment
    JOIN program_version_modules version_module
      ON version_module.organization_id = enrollment.organization_id
     AND version_module.id = NEW.program_version_module_id
    WHERE enrollment.organization_id = NEW.organization_id
      AND enrollment.id = NEW.enrollment_id
      AND version_module.program_version_id = enrollment.program_version_id
  ) THEN
    RAISE EXCEPTION 'Retake module must belong to the enrollment program version'
      USING ERRCODE = '23514', CONSTRAINT = 'module_retake_program_match';
  END IF;

  IF NEW.target_cohort_module_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM cohort_modules cohort_module
    JOIN cohorts cohort
      ON cohort.organization_id = cohort_module.organization_id
     AND cohort.id = cohort_module.cohort_id
    WHERE cohort_module.organization_id = NEW.organization_id
      AND cohort_module.id = NEW.target_cohort_module_id
      AND cohort_module.program_version_module_id = NEW.program_version_module_id
      AND cohort.status IN ('PLANNED', 'ACTIVE')
  ) THEN
    RAISE EXCEPTION 'Retake target must instantiate the requested module'
      USING ERRCODE = '23514', CONSTRAINT = 'module_retake_target_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER module_retakes_links_guard
BEFORE INSERT OR UPDATE OF organization_id, enrollment_id, program_version_module_id,
  target_cohort_module_id ON module_retakes
FOR EACH ROW EXECUTE FUNCTION validate_module_retake_links();
