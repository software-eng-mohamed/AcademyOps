ALTER TABLE "pricing_agreements"
  ADD COLUMN "lock_version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "pricing_agreements_version_check" CHECK ("version" > 0 AND "lock_version" > 0),
  ADD CONSTRAINT "pricing_agreements_status_check" CHECK ("status" IN ('DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  ADD CONSTRAINT "pricing_agreements_approval_metadata_check" CHECK (
    ("status" IN ('APPROVED', 'SUPERSEDED') AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)
    OR ("status" NOT IN ('APPROVED', 'SUPERSEDED') AND "approved_by" IS NULL AND "approved_at" IS NULL)
  );

ALTER TABLE "installment_schedules"
  ADD COLUMN "lock_version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "installment_schedules_version_check" CHECK ("version" > 0 AND "lock_version" > 0),
  ADD CONSTRAINT "installment_schedules_status_check" CHECK ("status" IN ('DRAFT', 'APPROVED', 'CANCELLED')),
  ADD CONSTRAINT "installment_schedules_approval_metadata_check" CHECK (
    ("status" = 'APPROVED' AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)
    OR ("status" <> 'APPROVED' AND "approved_by" IS NULL AND "approved_at" IS NULL)
  );

CREATE OR REPLACE FUNCTION plg_pricing_agreement_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lines_total numeric(14,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'pricing agreement must start as DRAFT' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'non-draft pricing agreement is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF (NEW.organization_id, NEW.enrollment_id, NEW.version, NEW.proposed_by)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.enrollment_id, OLD.version, OLD.proposed_by) THEN
    RAISE EXCEPTION 'pricing agreement identity is immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.status <> 'DRAFT' AND
     (NEW.currency_code, NEW.subtotal, NEW.discount_amount, NEW.total_amount)
     IS DISTINCT FROM
     (OLD.currency_code, OLD.subtotal, OLD.discount_amount, OLD.total_amount) THEN
    RAISE EXCEPTION 'submitted pricing agreement amounts are immutable' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'DRAFT' AND NEW.status = 'PROPOSED')
    OR (OLD.status = 'PROPOSED' AND NEW.status IN ('APPROVED', 'REJECTED'))
    OR (OLD.status = 'APPROVED' AND NEW.status = 'SUPERSEDED')
  ) THEN
    RAISE EXCEPTION 'invalid pricing agreement transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'PROPOSED' THEN
    SELECT COALESCE(SUM(line_amount), 0) INTO lines_total
    FROM pricing_agreement_lines
    WHERE organization_id = NEW.organization_id AND pricing_agreement_id = NEW.id;
    IF lines_total <> NEW.subtotal OR lines_total <= 0 THEN
      RAISE EXCEPTION 'pricing agreement lines must equal a positive subtotal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pricing_agreement_lifecycle_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "pricing_agreements"
FOR EACH ROW EXECUTE FUNCTION plg_pricing_agreement_guard();

CREATE OR REPLACE FUNCTION plg_pricing_line_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  agreement_status text;
  agreement_org uuid;
  agreement_id uuid;
BEGIN
  agreement_org := COALESCE(NEW.organization_id, OLD.organization_id);
  agreement_id := COALESCE(NEW.pricing_agreement_id, OLD.pricing_agreement_id);
  SELECT status INTO agreement_status FROM pricing_agreements
  WHERE organization_id = agreement_org AND id = agreement_id
  FOR UPDATE;
  IF agreement_status IS NULL OR agreement_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'pricing lines may only change while agreement is DRAFT' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "pricing_line_draft_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "pricing_agreement_lines"
FOR EACH ROW EXECUTE FUNCTION plg_pricing_line_guard();

CREATE OR REPLACE FUNCTION plg_installment_schedule_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  agreement_enrollment uuid;
  agreement_status text;
  agreement_total numeric(14,2);
  installment_total numeric(14,2);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'installment schedule must start as DRAFT' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'approved installment schedule is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  SELECT enrollment_id, status, total_amount
    INTO agreement_enrollment, agreement_status, agreement_total
  FROM pricing_agreements
  WHERE organization_id = NEW.organization_id AND id = NEW.pricing_agreement_id;
  IF agreement_enrollment IS NULL OR agreement_enrollment <> NEW.enrollment_id THEN
    RAISE EXCEPTION 'installment schedule enrollment does not match pricing agreement' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.organization_id, NEW.enrollment_id, NEW.pricing_agreement_id, NEW.version)
       IS DISTINCT FROM
       (OLD.organization_id, OLD.enrollment_id, OLD.pricing_agreement_id, OLD.version) THEN
      RAISE EXCEPTION 'installment schedule identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      NEW.status = OLD.status
      OR (OLD.status = 'DRAFT' AND NEW.status IN ('APPROVED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'invalid installment schedule transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'DRAFT' AND NEW.status = 'APPROVED' THEN
      IF agreement_status <> 'APPROVED' THEN
        RAISE EXCEPTION 'pricing agreement must be approved first' USING ERRCODE = '23514';
      END IF;
      SELECT COALESCE(SUM(amount), 0) INTO installment_total
      FROM installments
      WHERE organization_id = NEW.organization_id AND schedule_id = NEW.id;
      IF installment_total <> agreement_total OR installment_total <= 0 THEN
        RAISE EXCEPTION 'installments must equal pricing agreement total' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "installment_schedule_lifecycle_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "installment_schedules"
FOR EACH ROW EXECUTE FUNCTION plg_installment_schedule_guard();

CREATE OR REPLACE FUNCTION plg_installment_mutation_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  schedule_status text;
BEGIN
  SELECT status INTO schedule_status FROM installment_schedules
  WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
    AND id = COALESCE(NEW.schedule_id, OLD.schedule_id)
  FOR UPDATE;

  IF schedule_status = 'DRAFT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE'
     AND schedule_status = 'APPROVED'
     AND OLD.debit_entry_id IS NULL
     AND NEW.debit_entry_id IS NOT NULL
     AND (NEW.organization_id, NEW.schedule_id, NEW.ordinal, NEW.due_date, NEW.amount)
         IS NOT DISTINCT FROM
         (OLD.organization_id, OLD.schedule_id, OLD.ordinal, OLD.due_date, OLD.amount) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'installments are immutable after schedule approval' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "installment_schedule_state_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "installments"
FOR EACH ROW EXECUTE FUNCTION plg_installment_mutation_guard();
