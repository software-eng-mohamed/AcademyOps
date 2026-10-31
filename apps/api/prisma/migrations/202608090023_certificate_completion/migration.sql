ALTER TABLE certificates
  ADD COLUMN version integer NOT NULL DEFAULT 1;

ALTER TABLE certificate_events
  ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE eligibility_evaluations
  ADD CONSTRAINT eligibility_academic_result_check CHECK (
    academic_result IN ('ELIGIBLE', 'INELIGIBLE')
  );

ALTER TABLE file_assets
  ADD CONSTRAINT file_assets_classification_check CHECK (
    classification IN ('PRIVATE', 'PUBLIC')
  ),
  ADD CONSTRAINT file_assets_scan_status_check CHECK (
    scan_status IN ('PENDING', 'CLEAN', 'REJECTED', 'FAILED')
  );

ALTER TABLE certificates
  ADD CONSTRAINT certificates_version_check CHECK (version >= 1),
  ADD CONSTRAINT certificates_validity_status_check CHECK (
    validity_status IN ('ISSUED', 'REVOKED')
  ),
  ADD CONSTRAINT certificates_fulfillment_status_check CHECK (
    fulfillment_status IN ('NOT_PRINTED', 'PRINTED', 'READY_FOR_COLLECTION', 'COLLECTED')
  ),
  ADD CONSTRAINT certificates_pdf_status_check CHECK (
    pdf_status IN ('QUEUED', 'AVAILABLE', 'FAILED')
  ),
  ADD CONSTRAINT certificates_revocation_fields_check CHECK (
    (
      validity_status = 'ISSUED'
      AND revoked_at IS NULL
      AND revoked_by IS NULL
      AND revocation_reason IS NULL
    ) OR (
      validity_status = 'REVOKED'
      AND revoked_at IS NOT NULL
      AND revoked_by IS NOT NULL
      AND length(trim(revocation_reason)) >= 3
    )
  ),
  ADD CONSTRAINT certificates_pdf_file_check CHECK (
    (pdf_status = 'AVAILABLE' AND file_asset_id IS NOT NULL)
    OR (pdf_status IN ('QUEUED', 'FAILED') AND file_asset_id IS NULL)
  );

ALTER TABLE certificate_events
  ADD CONSTRAINT certificate_events_type_check CHECK (
    type IN (
      'ISSUED',
      'REISSUED',
      'REVOKED',
      'FULFILLMENT_CHANGED',
      'PDF_AVAILABLE',
      'PDF_FAILED'
    )
  );

CREATE UNIQUE INDEX certificate_rule_versions_scope_version_key
  ON certificate_rule_versions (
    organization_id,
    program_version_id,
    COALESCE(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

ALTER TABLE certificate_rule_versions
  ADD CONSTRAINT certificate_rule_versions_no_overlap
  EXCLUDE USING gist (
    organization_id WITH =,
    program_version_id WITH =,
    (COALESCE(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  );

CREATE OR REPLACE FUNCTION guard_certificate_rule_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Certificate rule versions cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'certificate_rule_versions_immutable';
  END IF;

  IF OLD.organization_id = NEW.organization_id
    AND OLD.program_version_id = NEW.program_version_id
    AND OLD.cohort_id IS NOT DISTINCT FROM NEW.cohort_id
    AND OLD.version = NEW.version
    AND OLD.minimum_ratio = NEW.minimum_ratio
    AND OLD.effective_from = NEW.effective_from
    AND OLD.created_by = NEW.created_by
    AND OLD.created_at = NEW.created_at
    AND OLD.effective_to IS NULL
    AND NEW.effective_to > OLD.effective_from THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Certificate rule versions are immutable except when closing an open period'
    USING ERRCODE = '23514', CONSTRAINT = 'certificate_rule_versions_immutable';
END;
$$;

CREATE TRIGGER certificate_rule_versions_mutation_guard
BEFORE UPDATE OR DELETE ON certificate_rule_versions
FOR EACH ROW EXECUTE FUNCTION guard_certificate_rule_version_mutation();

CREATE OR REPLACE FUNCTION validate_eligibility_evaluation_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  enrollment_program_version_id uuid;
  rule_program_version_id uuid;
  rule_cohort_id uuid;
BEGIN
  SELECT program_version_id
  INTO enrollment_program_version_id
  FROM enrollments
  WHERE organization_id = NEW.organization_id
    AND id = NEW.enrollment_id;

  SELECT program_version_id, cohort_id
  INTO rule_program_version_id, rule_cohort_id
  FROM certificate_rule_versions
  WHERE organization_id = NEW.organization_id
    AND id = NEW.rule_version_id;

  IF enrollment_program_version_id IS NULL
    OR enrollment_program_version_id <> rule_program_version_id THEN
    RAISE EXCEPTION 'Certificate rule must match the enrollment program version'
      USING ERRCODE = '23514', CONSTRAINT = 'eligibility_rule_program_match';
  END IF;

  IF rule_cohort_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM enrollment_cohort_assignments assignment
    WHERE assignment.organization_id = NEW.organization_id
      AND assignment.enrollment_id = NEW.enrollment_id
      AND assignment.cohort_id = rule_cohort_id
  ) THEN
    RAISE EXCEPTION 'Cohort certificate rule must match enrollment placement history'
      USING ERRCODE = '23514', CONSTRAINT = 'eligibility_rule_cohort_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER eligibility_evaluations_scope_guard
BEFORE INSERT ON eligibility_evaluations
FOR EACH ROW EXECUTE FUNCTION validate_eligibility_evaluation_scope();

CREATE TRIGGER eligibility_evaluations_append_only
BEFORE UPDATE OR DELETE ON eligibility_evaluations
FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

CREATE TRIGGER file_assets_append_only
BEFORE UPDATE OR DELETE ON file_assets
FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

CREATE OR REPLACE FUNCTION validate_certificate_issue_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  evaluation_enrollment_id uuid;
  evaluation_rule_id uuid;
  evaluation_result text;
  evaluation_hold boolean;
  rule_minimum numeric;
  enrollment_state text;
  attendance_numerator bigint;
  attendance_denominator bigint;
  outstanding numeric;
  superseded_enrollment_id uuid;
  superseded_validity text;
BEGIN
  SELECT evaluation.enrollment_id,
         evaluation.rule_version_id,
         evaluation.academic_result,
         evaluation.financial_hold
  INTO evaluation_enrollment_id,
       evaluation_rule_id,
       evaluation_result,
       evaluation_hold
  FROM eligibility_evaluations evaluation
  WHERE evaluation.organization_id = NEW.organization_id
    AND evaluation.id = NEW.evaluation_id;

  SELECT minimum_ratio
  INTO rule_minimum
  FROM certificate_rule_versions
  WHERE organization_id = NEW.organization_id
    AND id = evaluation_rule_id;

  SELECT state
  INTO enrollment_state
  FROM enrollments
  WHERE organization_id = NEW.organization_id
    AND id = NEW.enrollment_id;

  SELECT
    COUNT(*) FILTER (
      WHERE record.current_status IN ('PRESENT', 'LATE')
         OR (
           record.current_status = 'ABSENT'
           AND EXISTS (
             SELECT 1
             FROM makeup_credits credit
             JOIN attendance_records makeup
               ON makeup.organization_id = credit.organization_id
              AND makeup.id = credit.makeup_record_id
             WHERE credit.organization_id = record.organization_id
               AND credit.missed_record_id = record.id
               AND makeup.current_status IN ('PRESENT', 'LATE')
           )
         )
    ),
    COUNT(*) FILTER (WHERE record.current_status IN ('PRESENT', 'LATE', 'ABSENT'))
  INTO attendance_numerator, attendance_denominator
  FROM attendance_records record
  WHERE record.organization_id = NEW.organization_id
    AND record.enrollment_id = NEW.enrollment_id;

  SELECT COALESCE(SUM(entry.amount - COALESCE(allocation.total, 0)), 0)
  INTO outstanding
  FROM ledger_entries entry
  LEFT JOIN LATERAL (
    SELECT SUM(allocated.amount) AS total
    FROM ledger_allocations allocated
    WHERE allocated.organization_id = entry.organization_id
      AND allocated.debit_entry_id = entry.id
  ) allocation ON true
  WHERE entry.organization_id = NEW.organization_id
    AND entry.enrollment_id = NEW.enrollment_id
    AND entry.direction = 'DEBIT';

  IF evaluation_enrollment_id IS NULL
    OR evaluation_enrollment_id <> NEW.enrollment_id
    OR evaluation_result <> 'ELIGIBLE'
    OR evaluation_hold
    OR enrollment_state <> 'COMPLETED'
    OR attendance_denominator = 0
    OR attendance_numerator::numeric / attendance_denominator < GREATEST(rule_minimum, 0.8000)
    OR outstanding > 0 THEN
    RAISE EXCEPTION 'Certificate requires completed enrollment, 80 percent attendance, and zero outstanding balance'
      USING ERRCODE = '23514', CONSTRAINT = 'certificate_issue_gate';
  END IF;

  IF NEW.supersedes_id IS NOT NULL THEN
    SELECT enrollment_id, validity_status
    INTO superseded_enrollment_id, superseded_validity
    FROM certificates
    WHERE organization_id = NEW.organization_id
      AND id = NEW.supersedes_id;
    IF superseded_enrollment_id IS NULL
      OR superseded_enrollment_id <> NEW.enrollment_id
      OR superseded_validity <> 'REVOKED' THEN
      RAISE EXCEPTION 'A reissued certificate must supersede a revoked certificate for the same enrollment'
        USING ERRCODE = '23514', CONSTRAINT = 'certificate_supersedes_valid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER certificates_issue_gate
BEFORE INSERT OR UPDATE OF enrollment_id, evaluation_id, supersedes_id ON certificates
FOR EACH ROW EXECUTE FUNCTION validate_certificate_issue_gate();

CREATE OR REPLACE FUNCTION guard_certificate_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Certificates cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'certificates_no_delete';
  END IF;

  IF OLD.organization_id <> NEW.organization_id
    OR OLD.enrollment_id <> NEW.enrollment_id
    OR OLD.evaluation_id <> NEW.evaluation_id
    OR OLD.supersedes_id IS DISTINCT FROM NEW.supersedes_id
    OR OLD.serial <> NEW.serial
    OR OLD.verification_digest <> NEW.verification_digest
    OR OLD.issued_at <> NEW.issued_at
    OR OLD.issued_by <> NEW.issued_by
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'Issued certificate identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'certificates_identity_immutable';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Certificate mutations must increment version exactly once'
      USING ERRCODE = '23514', CONSTRAINT = 'certificates_version_increment';
  END IF;

  IF OLD.validity_status <> NEW.validity_status
    AND NOT (OLD.validity_status = 'ISSUED' AND NEW.validity_status = 'REVOKED') THEN
    RAISE EXCEPTION 'Invalid certificate validity transition'
      USING ERRCODE = '23514', CONSTRAINT = 'certificate_validity_transition';
  END IF;

  IF OLD.fulfillment_status <> NEW.fulfillment_status THEN
    IF OLD.validity_status <> 'ISSUED'
      OR NEW.validity_status <> 'ISSUED'
      OR NOT (
        (OLD.fulfillment_status = 'NOT_PRINTED' AND NEW.fulfillment_status = 'PRINTED')
        OR (
          OLD.fulfillment_status = 'PRINTED'
          AND NEW.fulfillment_status = 'READY_FOR_COLLECTION'
        )
        OR (
          OLD.fulfillment_status = 'READY_FOR_COLLECTION'
          AND NEW.fulfillment_status = 'COLLECTED'
        )
      ) THEN
      RAISE EXCEPTION 'Invalid certificate fulfillment transition'
        USING ERRCODE = '23514', CONSTRAINT = 'certificate_fulfillment_transition';
    END IF;
  END IF;

  IF OLD.pdf_status <> NEW.pdf_status
    AND NOT (
      OLD.pdf_status = 'QUEUED'
      AND NEW.pdf_status IN ('AVAILABLE', 'FAILED')
    ) THEN
    RAISE EXCEPTION 'Invalid certificate PDF transition'
      USING ERRCODE = '23514', CONSTRAINT = 'certificate_pdf_transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER certificates_mutation_guard
BEFORE UPDATE OR DELETE ON certificates
FOR EACH ROW EXECUTE FUNCTION guard_certificate_mutation();
