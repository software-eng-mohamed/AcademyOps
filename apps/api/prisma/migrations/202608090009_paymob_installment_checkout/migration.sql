CREATE TABLE payment_gateway_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  installment_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  billing_account_id uuid NOT NULL,
  payment_id uuid,
  provider varchar(30) NOT NULL DEFAULT 'PAYMOB',
  status varchar(30) NOT NULL DEFAULT 'CREATED',
  internal_reference varchar(100) NOT NULL,
  provider_intention_id varchar(100),
  provider_transaction_id varchar(100),
  amount numeric(14,2) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'EGP',
  idempotency_key varchar(128) NOT NULL,
  checkout_secret_ciphertext text,
  failure_code varchar(100),
  created_by uuid NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT payment_gateway_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT payment_gateway_attempts_amount_check CHECK (amount > 0 AND currency_code = 'EGP'),
  CONSTRAINT payment_gateway_attempts_provider_check CHECK (provider = 'PAYMOB'),
  CONSTRAINT payment_gateway_attempts_status_check CHECK (
    status IN ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'REVIEW_REQUIRED', 'CANCELLED')
  )
);

CREATE UNIQUE INDEX payment_gateway_attempts_organization_id_id_key
  ON payment_gateway_attempts (organization_id, id);
CREATE UNIQUE INDEX payment_gateway_attempts_internal_reference_key
  ON payment_gateway_attempts (internal_reference);
CREATE UNIQUE INDEX payment_gateway_attempts_idempotency_key
  ON payment_gateway_attempts (organization_id, provider, idempotency_key);
CREATE UNIQUE INDEX payment_gateway_attempts_payment_key
  ON payment_gateway_attempts (organization_id, payment_id);
CREATE UNIQUE INDEX payment_gateway_attempts_provider_transaction_key
  ON payment_gateway_attempts (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX payment_gateway_attempts_one_active_installment
  ON payment_gateway_attempts (organization_id, installment_id)
  WHERE status IN ('CREATED', 'PENDING', 'UNKNOWN');
CREATE INDEX payment_gateway_attempts_installment_status_idx
  ON payment_gateway_attempts (organization_id, installment_id, status);
CREATE INDEX payment_gateway_attempts_intention_idx
  ON payment_gateway_attempts (organization_id, provider, provider_intention_id);

CREATE TABLE payment_gateway_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  provider varchar(30) NOT NULL DEFAULT 'PAYMOB',
  provider_event_id varchar(100) NOT NULL,
  event_type varchar(50) NOT NULL,
  payload_digest char(64) NOT NULL,
  received_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at timestamptz(6),
  CONSTRAINT payment_gateway_events_pkey PRIMARY KEY (id),
  CONSTRAINT payment_gateway_events_provider_check CHECK (provider = 'PAYMOB')
);

CREATE UNIQUE INDEX payment_gateway_events_organization_id_id_key
  ON payment_gateway_events (organization_id, id);
CREATE UNIQUE INDEX payment_gateway_events_provider_event_key
  ON payment_gateway_events (organization_id, provider, provider_event_id, event_type);
CREATE INDEX payment_gateway_events_attempt_received_idx
  ON payment_gateway_events (organization_id, attempt_id, received_at);

ALTER TABLE payment_gateway_attempts
  ADD CONSTRAINT payment_gateway_attempts_installment_fk
  FOREIGN KEY (organization_id, installment_id)
  REFERENCES installments (organization_id, id)
  ON DELETE RESTRICT;
ALTER TABLE payment_gateway_attempts
  ADD CONSTRAINT payment_gateway_attempts_enrollment_fk
  FOREIGN KEY (organization_id, enrollment_id)
  REFERENCES enrollments (organization_id, id)
  ON DELETE RESTRICT;
ALTER TABLE payment_gateway_attempts
  ADD CONSTRAINT payment_gateway_attempts_billing_fk
  FOREIGN KEY (organization_id, billing_account_id)
  REFERENCES billing_accounts (organization_id, id)
  ON DELETE RESTRICT;
ALTER TABLE payment_gateway_attempts
  ADD CONSTRAINT payment_gateway_attempts_payment_fk
  FOREIGN KEY (organization_id, payment_id)
  REFERENCES payments (organization_id, id)
  ON DELETE RESTRICT;
ALTER TABLE payment_gateway_attempts
  ADD CONSTRAINT payment_gateway_attempts_creator_fk
  FOREIGN KEY (organization_id, created_by)
  REFERENCES users (organization_id, id)
  ON DELETE RESTRICT;
ALTER TABLE payment_gateway_events
  ADD CONSTRAINT payment_gateway_events_attempt_fk
  FOREIGN KEY (organization_id, attempt_id)
  REFERENCES payment_gateway_attempts (organization_id, id)
  ON DELETE RESTRICT;

CREATE FUNCTION plg_validate_gateway_attempt() RETURNS trigger AS $$
DECLARE
  expected_enrollment uuid;
  expected_billing uuid;
BEGIN
  SELECT schedules.enrollment_id
    INTO expected_enrollment
    FROM installments
    JOIN installment_schedules schedules
      ON schedules.organization_id = installments.organization_id
     AND schedules.id = installments.schedule_id
   WHERE installments.organization_id = NEW.organization_id
     AND installments.id = NEW.installment_id;

  SELECT billing_account_id
    INTO expected_billing
    FROM enrollments
   WHERE organization_id = NEW.organization_id
     AND id = NEW.enrollment_id;

  IF expected_enrollment IS DISTINCT FROM NEW.enrollment_id
     OR expected_billing IS DISTINCT FROM NEW.billing_account_id THEN
    RAISE EXCEPTION 'Gateway attempt does not match installment enrollment and billing account';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
       OR OLD.installment_id IS DISTINCT FROM NEW.installment_id
       OR OLD.enrollment_id IS DISTINCT FROM NEW.enrollment_id
       OR OLD.billing_account_id IS DISTINCT FROM NEW.billing_account_id
       OR OLD.provider IS DISTINCT FROM NEW.provider
       OR OLD.internal_reference IS DISTINCT FROM NEW.internal_reference
       OR OLD.amount IS DISTINCT FROM NEW.amount
       OR OLD.currency_code IS DISTINCT FROM NEW.currency_code
       OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
       OR OLD.created_by IS DISTINCT FROM NEW.created_by THEN
      RAISE EXCEPTION 'Gateway attempt identity and amount are immutable';
    END IF;
    IF OLD.status = 'SUCCEEDED' AND NEW.status <> 'SUCCEEDED' THEN
      RAISE EXCEPTION 'Succeeded gateway attempt cannot be downgraded';
    END IF;
    IF OLD.payment_id IS NOT NULL AND OLD.payment_id IS DISTINCT FROM NEW.payment_id THEN
      RAISE EXCEPTION 'Gateway attempt payment link is immutable once set';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_gateway_attempts_guard
  BEFORE INSERT OR UPDATE ON payment_gateway_attempts
  FOR EACH ROW EXECUTE FUNCTION plg_validate_gateway_attempt();

CREATE TRIGGER payment_gateway_attempts_delete_guard
  BEFORE DELETE ON payment_gateway_attempts
  FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

CREATE TRIGGER payment_gateway_events_append_only
  BEFORE UPDATE OR DELETE ON payment_gateway_events
  FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

INSERT INTO permissions (code, description)
VALUES ('payments.checkout', 'Create a hosted payment checkout for an installment')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permission_grants (id, organization_id, role_id, permission_code, scope, created_at)
SELECT gen_random_uuid(), organization_id, id, 'payments.checkout',
       CASE code WHEN 'OWNER' THEN 'O' WHEN 'ACCOUNTS' THEN 'B' ELSE 'S' END,
       now()
FROM roles
WHERE code IN ('OWNER', 'ACCOUNTS', 'STUDENT')
ON CONFLICT (organization_id, role_id, permission_code, scope) DO NOTHING;

INSERT INTO payment_methods (
  id, organization_id, code, name_ar, name_en, verification_required, is_active, created_at, updated_at
)
SELECT gen_random_uuid(), id, 'PAYMOB', 'باي موب', 'Paymob', true, true, now(), now()
FROM organizations
ON CONFLICT (organization_id, code) DO UPDATE
SET name_ar = EXCLUDED.name_ar,
    name_en = EXCLUDED.name_en,
    verification_required = true,
    is_active = true,
    updated_at = now();
