-- Replacements must serialize with activation. Initial legacy pricing is allowed:
-- the importer creates historical ACTIVE/COMPLETED enrollments before finance.
-- Application services enforce DRAFT/PENDING_APPROVAL for all ordinary writes.
-- No historical rows are rewritten; obsolete proposals can still be rejected.
CREATE FUNCTION plg_pricing_enrollment_state_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  enrollment_state text;
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('APPROVED', 'SUPERSEDED') THEN
    RETURN NEW;
  END IF;
  SELECT state INTO enrollment_state FROM enrollments
  WHERE organization_id = NEW.organization_id AND id = NEW.enrollment_id
  FOR UPDATE;
  IF enrollment_state NOT IN ('DRAFT', 'PENDING_APPROVAL') AND (
    NEW.status = 'SUPERSEDED' OR EXISTS (
      SELECT 1 FROM pricing_agreements
      WHERE organization_id = NEW.organization_id AND enrollment_id = NEW.enrollment_id
        AND id <> NEW.id AND status IN ('APPROVED', 'SUPERSEDED')
    )
  ) THEN
    RAISE EXCEPTION 'enrollment pricing is locked after activation'
      USING ERRCODE = '23514', CONSTRAINT = 'pricing_enrollment_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pricing_enrollment_state_guard
BEFORE UPDATE OF status ON pricing_agreements
FOR EACH ROW EXECUTE FUNCTION plg_pricing_enrollment_state_guard();

CREATE FUNCTION plg_schedule_enrollment_state_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  enrollment_state text;
BEGIN
  IF NEW.status = OLD.status OR NEW.status <> 'APPROVED' THEN
    RETURN NEW;
  END IF;
  SELECT state INTO enrollment_state FROM enrollments
  WHERE organization_id = NEW.organization_id AND id = NEW.enrollment_id
  FOR UPDATE;
  IF enrollment_state NOT IN ('DRAFT', 'PENDING_APPROVAL') AND EXISTS (
    SELECT 1 FROM installment_schedules
    WHERE organization_id = NEW.organization_id AND enrollment_id = NEW.enrollment_id
      AND id <> NEW.id AND status = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'installment schedule is locked after activation'
      USING ERRCODE = '23514', CONSTRAINT = 'schedule_enrollment_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_enrollment_state_guard
BEFORE UPDATE OF status ON installment_schedules
FOR EACH ROW EXECUTE FUNCTION plg_schedule_enrollment_state_guard();
