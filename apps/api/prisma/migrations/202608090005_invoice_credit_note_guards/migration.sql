CREATE UNIQUE INDEX invoice_lines_one_document_per_ledger_entry
  ON invoice_lines (organization_id, ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL;

ALTER TABLE internal_invoices
  ADD CONSTRAINT internal_invoices_status_check
  CHECK (status IN ('DRAFT', 'ISSUED', 'CANCELLED', 'VOIDED'));

CREATE FUNCTION plg_guard_invoice_line_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  invoice_status text;
  target_invoice_id uuid;
  target_organization_id uuid;
BEGIN
  target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  target_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
  SELECT status INTO invoice_status
    FROM internal_invoices
    WHERE organization_id = target_organization_id AND id = target_invoice_id
    FOR UPDATE;
  IF invoice_status IS NULL OR invoice_status <> 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Issued invoice lines are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER invoice_lines_issued_guard
BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines
FOR EACH ROW EXECUTE FUNCTION plg_guard_invoice_line_mutation();

CREATE FUNCTION plg_guard_invoice_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('ISSUED', 'CANCELLED')) OR
    (OLD.status = 'ISSUED' AND NEW.status = 'VOIDED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid invoice state transition';
  END IF;
  IF NEW.status = 'VOIDED' AND (
    EXISTS (
      SELECT 1
      FROM invoice_lines line
      JOIN ledger_allocations allocation
        ON allocation.organization_id = line.organization_id
       AND allocation.debit_entry_id = line.ledger_entry_id
      WHERE line.organization_id = OLD.organization_id AND line.invoice_id = OLD.id
    ) OR EXISTS (
      SELECT 1 FROM credit_notes note
      WHERE note.organization_id = OLD.organization_id AND note.invoice_id = OLD.id
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Settled or credited invoice cannot be voided';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_state_guard
BEFORE UPDATE ON internal_invoices
FOR EACH ROW EXECUTE FUNCTION plg_guard_invoice_state();

CREATE FUNCTION plg_guard_credit_note_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  invoice_total numeric(14,2);
  invoice_status text;
  invoice_billing_account_id uuid;
  entry_amount numeric(14,2);
  entry_direction text;
  entry_billing_account_id uuid;
  credited_total numeric(14,2);
BEGIN
  SELECT total_amount, status, billing_account_id
    INTO invoice_total, invoice_status, invoice_billing_account_id
    FROM internal_invoices
    WHERE organization_id = NEW.organization_id AND id = NEW.invoice_id
    FOR UPDATE;
  IF invoice_status <> 'ISSUED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Credit note requires an issued invoice';
  END IF;

  SELECT amount, direction, billing_account_id
    INTO entry_amount, entry_direction, entry_billing_account_id
    FROM ledger_entries
    WHERE organization_id = NEW.organization_id AND id = NEW.ledger_entry_id;
  IF entry_direction <> 'CREDIT' OR entry_amount <> NEW.amount OR entry_billing_account_id <> invoice_billing_account_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Credit note ledger entry is inconsistent';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO credited_total
    FROM credit_notes
    WHERE organization_id = NEW.organization_id AND invoice_id = NEW.invoice_id;
  IF credited_total + NEW.amount > invoice_total THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Credit notes exceed invoice total';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER credit_note_total_guard
BEFORE INSERT ON credit_notes
FOR EACH ROW EXECUTE FUNCTION plg_guard_credit_note_total();
