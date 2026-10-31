CREATE OR REPLACE FUNCTION plg_check_installment_schedule_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_schedule_id uuid;
  schedule_status text;
  agreement_total numeric(14,2);
  installment_total numeric(14,2);
BEGIN
  IF TG_TABLE_NAME = 'installment_schedules' THEN
    target_schedule_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_schedule_id := OLD.schedule_id;
  ELSE
    target_schedule_id := NEW.schedule_id;
  END IF;
  SELECT s.status, p.total_amount
    INTO schedule_status, agreement_total
    FROM installment_schedules s
    JOIN pricing_agreements p
      ON p.organization_id = s.organization_id AND p.id = s.pricing_agreement_id
    WHERE s.id = target_schedule_id;
  IF schedule_status = 'APPROVED' THEN
    SELECT COALESCE(SUM(i.amount), 0)
      INTO installment_total
      FROM installments i
      WHERE i.schedule_id = target_schedule_id;
    IF installment_total <> agreement_total THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Approved installment total must equal pricing agreement total';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION plg_pricing_line_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  agreement_status text;
  agreement_org uuid;
  agreement_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    agreement_org := OLD.organization_id;
    agreement_id := OLD.pricing_agreement_id;
  ELSE
    agreement_org := NEW.organization_id;
    agreement_id := NEW.pricing_agreement_id;
  END IF;
  SELECT status INTO agreement_status FROM pricing_agreements
  WHERE organization_id = agreement_org AND id = agreement_id
  FOR UPDATE;
  IF agreement_status IS NULL OR agreement_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'pricing lines may only change while agreement is DRAFT' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION plg_installment_mutation_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  schedule_status text;
  target_organization_id uuid;
  target_schedule_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_organization_id := OLD.organization_id;
    target_schedule_id := OLD.schedule_id;
  ELSE
    target_organization_id := NEW.organization_id;
    target_schedule_id := NEW.schedule_id;
  END IF;
  SELECT status INTO schedule_status FROM installment_schedules
  WHERE organization_id = target_organization_id AND id = target_schedule_id
  FOR UPDATE;

  IF schedule_status = 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
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
