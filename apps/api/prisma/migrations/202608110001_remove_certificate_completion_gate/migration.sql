-- Custom migration to remove completed enrollment gate from certificate trigger
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
    OR attendance_denominator = 0
    OR attendance_numerator::numeric / attendance_denominator < GREATEST(rule_minimum, 0.8000)
    OR outstanding > 0 THEN
    RAISE EXCEPTION 'Certificate requires 80 percent attendance and zero outstanding balance'
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
