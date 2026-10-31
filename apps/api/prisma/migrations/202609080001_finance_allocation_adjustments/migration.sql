-- Preserve every historic allocation. Negative events release a specific original
-- allocation into a documented refund/reversal debit; readers keep summing amount.
ALTER TABLE ledger_allocations
  ADD COLUMN reversal_of_allocation_id uuid,
  ADD COLUMN adjustment_entry_id uuid,
  DROP CONSTRAINT ledger_allocations_amount_check;
DROP INDEX ledger_allocations_organization_id_credit_entry_id_debit_en_key;
ALTER TABLE ledger_allocations
  ADD CONSTRAINT allocation_event_shape CHECK (
    (amount > 0 AND reversal_of_allocation_id IS NULL AND adjustment_entry_id IS NULL)
    OR (amount < 0 AND reversal_of_allocation_id IS NOT NULL AND adjustment_entry_id IS NOT NULL)
  ),
  ADD CONSTRAINT allocation_reversal_source_fk FOREIGN KEY (organization_id, reversal_of_allocation_id)
    REFERENCES ledger_allocations (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT allocation_adjustment_entry_fk FOREIGN KEY (organization_id, adjustment_entry_id)
    REFERENCES ledger_entries (organization_id, id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX allocation_adjustment_source_key
  ON ledger_allocations (organization_id, adjustment_entry_id, reversal_of_allocation_id);
CREATE INDEX allocation_reversal_source_idx
  ON ledger_allocations (organization_id, reversal_of_allocation_id);

CREATE OR REPLACE FUNCTION plg_guard_ledger_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  credit ledger_entries%ROWTYPE;
  debit ledger_entries%ROWTYPE;
  original ledger_allocations%ROWTYPE;
  adjustment ledger_entries%ROWTYPE;
  credit_allocated numeric;
  debit_allocated numeric;
  released numeric;
  adjustment_released numeric;
  adjustment_credit_id uuid;
BEGIN
  SELECT * INTO credit FROM ledger_entries
    WHERE organization_id = NEW.organization_id AND id = NEW.credit_entry_id FOR UPDATE;
  SELECT * INTO debit FROM ledger_entries
    WHERE organization_id = NEW.organization_id AND id = NEW.debit_entry_id FOR UPDATE;
  IF credit.id IS NULL OR debit.id IS NULL OR credit.direction <> 'CREDIT' OR debit.direction <> 'DEBIT'
    OR credit.billing_account_id <> debit.billing_account_id
    OR credit.currency_code <> debit.currency_code THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Allocation entries must share account, currency and opposite directions';
  END IF;

  IF NEW.amount < 0 THEN
    SELECT * INTO original FROM ledger_allocations
      WHERE organization_id = NEW.organization_id AND id = NEW.reversal_of_allocation_id;
    SELECT * INTO adjustment FROM ledger_entries
      WHERE organization_id = NEW.organization_id AND id = NEW.adjustment_entry_id;
    IF original.id IS NULL OR original.amount <= 0
      OR original.credit_entry_id <> NEW.credit_entry_id OR original.debit_entry_id <> NEW.debit_entry_id
      OR adjustment.id IS NULL OR adjustment.direction <> 'DEBIT'
      OR adjustment.entry_type NOT IN ('REFUND', 'PAYMENT_REVERSAL')
      OR adjustment.billing_account_id <> credit.billing_account_id
      OR debit.entry_type IN ('REFUND', 'PAYMENT_REVERSAL') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Allocation release must reference its original allocation and payment adjustment';
    END IF;
    SELECT -COALESCE(SUM(amount), 0) INTO released FROM ledger_allocations
      WHERE organization_id = NEW.organization_id AND reversal_of_allocation_id = original.id;
    SELECT -COALESCE(SUM(amount), 0) INTO adjustment_released FROM ledger_allocations
      WHERE organization_id = NEW.organization_id AND adjustment_entry_id = adjustment.id;
    IF released - NEW.amount > original.amount OR adjustment_released - NEW.amount > adjustment.amount THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Allocation release exceeds original allocation or adjustment';
    END IF;
  ELSIF debit.entry_type IN ('REFUND', 'PAYMENT_REVERSAL') THEN
    adjustment := debit;
  END IF;

  IF adjustment.id IS NOT NULL THEN
    IF adjustment.entry_type = 'PAYMENT_REVERSAL' THEN
      adjustment_credit_id := adjustment.reversal_of_id;
    ELSIF adjustment.source_type = 'REFUND_REQUEST' THEN
      SELECT payment.ledger_entry_id INTO adjustment_credit_id
      FROM refund_requests request JOIN payments payment
        ON payment.organization_id = request.organization_id AND payment.id = request.payment_id
      WHERE request.organization_id = NEW.organization_id AND request.id = adjustment.source_id;
    END IF;
    IF adjustment_credit_id IS DISTINCT FROM credit.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Adjustment must consume its own original payment credit';
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO credit_allocated FROM ledger_allocations
    WHERE organization_id = NEW.organization_id AND credit_entry_id = credit.id;
  SELECT COALESCE(SUM(amount), 0) INTO debit_allocated FROM ledger_allocations
    WHERE organization_id = NEW.organization_id AND debit_entry_id = debit.id;
  IF credit_allocated + NEW.amount NOT BETWEEN 0 AND credit.amount
    OR debit_allocated + NEW.amount NOT BETWEEN 0 AND debit.amount THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Ledger allocation exceeds entry amount';
  END IF;
  RETURN NEW;
END;
$$;

-- An allocation release and its adjustment settlement must commit together.
CREATE FUNCTION plg_check_adjustment_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  adjustment_id uuid;
  adjustment_amount numeric;
  allocated_amount numeric;
BEGIN
  adjustment_id := NEW.adjustment_entry_id;
  IF adjustment_id IS NULL THEN RETURN NEW; END IF;
  SELECT amount INTO adjustment_amount FROM ledger_entries
    WHERE organization_id = NEW.organization_id AND id = adjustment_id;
  SELECT COALESCE(SUM(amount), 0) INTO allocated_amount FROM ledger_allocations
    WHERE organization_id = NEW.organization_id AND debit_entry_id = adjustment_id;
  IF allocated_amount <> adjustment_amount THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Released allocation requires a fully settled payment adjustment';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER allocation_adjustment_settled
  AFTER INSERT ON ledger_allocations DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION plg_check_adjustment_allocation();

CREATE FUNCTION plg_guard_payment_adjustment_request() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE payment_status text;
BEGIN
  IF NEW.status <> 'REQUESTED' THEN RETURN NEW; END IF;
  SELECT status INTO payment_status FROM payments
    WHERE organization_id = NEW.organization_id AND id = NEW.payment_id FOR UPDATE;
  IF payment_status IS DISTINCT FROM 'POSTED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Adjustment request requires a posted payment';
  END IF;
  IF TG_TABLE_NAME = 'refund_requests' THEN
    IF EXISTS (SELECT 1 FROM payment_reversal_requests WHERE organization_id = NEW.organization_id
      AND payment_id = NEW.payment_id AND status = 'REQUESTED') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Payment has a pending reversal';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM refund_requests WHERE organization_id = NEW.organization_id
      AND payment_id = NEW.payment_id AND status = 'REQUESTED')
      OR EXISTS (SELECT 1 FROM refunds WHERE organization_id = NEW.organization_id AND payment_id = NEW.payment_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Payment has a pending or processed refund';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER refund_request_adjustment_conflict BEFORE INSERT ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION plg_guard_payment_adjustment_request();
CREATE TRIGGER reversal_request_adjustment_conflict BEFORE INSERT ON payment_reversal_requests
  FOR EACH ROW EXECUTE FUNCTION plg_guard_payment_adjustment_request();

CREATE OR REPLACE FUNCTION plg_guard_refund_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE payment_amount numeric; refunded_amount numeric;
BEGIN
  SELECT amount INTO payment_amount FROM payments
    WHERE organization_id = NEW.organization_id AND id = NEW.payment_id AND status = 'POSTED' FOR UPDATE;
  IF payment_amount IS NULL OR EXISTS (SELECT 1 FROM payment_reversal_requests
    WHERE organization_id = NEW.organization_id AND payment_id = NEW.payment_id AND status = 'REQUESTED') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Refund requires a posted payment without a pending reversal';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO refunded_amount FROM refunds
    WHERE organization_id = NEW.organization_id AND payment_id = NEW.payment_id;
  IF refunded_amount + NEW.amount > payment_amount THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Refund total exceeds payment amount';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION plg_guard_payment_reversal_refunds() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'REVERSED' AND OLD.status <> 'REVERSED' AND (
    EXISTS (SELECT 1 FROM refunds WHERE organization_id = NEW.organization_id AND payment_id = NEW.id)
    OR EXISTS (SELECT 1 FROM refund_requests WHERE organization_id = NEW.organization_id AND payment_id = NEW.id AND status = 'REQUESTED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cannot reverse a payment with pending or processed refunds';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_reversal_refund_conflict BEFORE UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION plg_guard_payment_reversal_refunds();
