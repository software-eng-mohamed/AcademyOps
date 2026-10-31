-- 1. Insert the new permission code
INSERT INTO permissions (code, description, created_at)
VALUES ('payments.verify', 'Verify payments', NOW())
ON CONFLICT (code) DO NOTHING;

-- 2. Remove disallowed ACCOUNTS grants
DELETE FROM role_permission_grants
WHERE role_id IN (SELECT id FROM roles WHERE code = 'ACCOUNTS')
  AND permission_code NOT IN (
    'students.read_basic',
    'students.read_contact',
    'academic.catalog.read',
    'enrollments.read',
    'pricing.read',
    'finance.balance.read',
    'payments.read',
    'payments.record',
    'payments.checkout',
    'invoices.read',
    'receipts.read',
    'finance.reports.read',
    'me.profile.update'
  );

-- 3. Grant it to all existing OWNER roles
INSERT INTO role_permission_grants (id, organization_id, role_id, permission_code, scope, created_at)
SELECT gen_random_uuid(), organization_id, id, 'payments.verify', 'O', NOW()
FROM roles
WHERE code = 'OWNER'
ON CONFLICT (organization_id, role_id, permission_code, scope) DO NOTHING;

-- 4. Add PostgreSQL trigger function and trigger to enforce Owner-only finance permissions
CREATE OR REPLACE FUNCTION guard_owner_only_finance_permissions()
RETURNS trigger AS $$
DECLARE
  role_code varchar(50);
BEGIN
  IF NEW.permission_code IN (
    'payments.reverse.request',
    'payments.reverse.approve',
    'refunds.request',
    'refunds.approve',
    'payments.verify'
  ) THEN
    SELECT code INTO role_code
    FROM roles
    WHERE id = NEW.role_id AND organization_id = NEW.organization_id;

    IF role_code IS NULL OR role_code <> 'OWNER' THEN
      RAISE EXCEPTION 'Finance verification, reversal and refund permissions are exclusive to the OWNER role'
        USING ERRCODE = '23514', CONSTRAINT = 'owner_only_finance_permissions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS role_permission_grants_owner_only_finance_permissions ON role_permission_grants;
CREATE TRIGGER role_permission_grants_owner_only_finance_permissions
  BEFORE INSERT OR UPDATE ON role_permission_grants
  FOR EACH ROW EXECUTE FUNCTION guard_owner_only_finance_permissions();

-- 5. Insert or update the five default payment methods for existing organizations correcting verification policies on conflict
INSERT INTO payment_methods (id, organization_id, code, name_ar, name_en, verification_required, is_active, created_at, updated_at)
SELECT gen_random_uuid(), id, 'CASH', 'نقدي', 'Cash', false, true, NOW(), NOW() FROM organizations
ON CONFLICT (organization_id, code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, verification_required = EXCLUDED.verification_required, is_active = EXCLUDED.is_active, updated_at = NOW();

INSERT INTO payment_methods (id, organization_id, code, name_ar, name_en, verification_required, is_active, created_at, updated_at)
SELECT gen_random_uuid(), id, 'INSTAPAY', 'إنستاباي', 'InstaPay', true, true, NOW(), NOW() FROM organizations
ON CONFLICT (organization_id, code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, verification_required = EXCLUDED.verification_required, is_active = EXCLUDED.is_active, updated_at = NOW();

INSERT INTO payment_methods (id, organization_id, code, name_ar, name_en, verification_required, is_active, created_at, updated_at)
SELECT gen_random_uuid(), id, 'VODAFONE_CASH', 'فودافون كاش', 'Vodafone Cash', true, true, NOW(), NOW() FROM organizations
ON CONFLICT (organization_id, code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, verification_required = EXCLUDED.verification_required, is_active = EXCLUDED.is_active, updated_at = NOW();

INSERT INTO payment_methods (id, organization_id, code, name_ar, name_en, verification_required, is_active, created_at, updated_at)
SELECT gen_random_uuid(), id, 'BANK_TRANSFER', 'تحويل بنكي', 'Bank Transfer', true, true, NOW(), NOW() FROM organizations
ON CONFLICT (organization_id, code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, verification_required = EXCLUDED.verification_required, is_active = EXCLUDED.is_active, updated_at = NOW();

INSERT INTO payment_methods (id, organization_id, code, name_ar, name_en, verification_required, is_active, created_at, updated_at)
SELECT gen_random_uuid(), id, 'PAYMOB', 'باي موب', 'Paymob', false, true, NOW(), NOW() FROM organizations
ON CONFLICT (organization_id, code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, verification_required = EXCLUDED.verification_required, is_active = EXCLUDED.is_active, updated_at = NOW();

-- 6. Add trigger to enforce that electronic payments cannot be posted immediately on insert
CREATE OR REPLACE FUNCTION guard_payment_creation_policy()
RETURNS trigger AS $$
DECLARE
  m_code varchar(50);
BEGIN
  SELECT code INTO m_code FROM payment_methods WHERE id = NEW.method_id;
  IF m_code IN ('INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER') AND NEW.status = 'POSTED' THEN
    RAISE EXCEPTION 'Electronic payments cannot be posted immediately'
      USING ERRCODE = '23514', CONSTRAINT = 'electronic_payment_no_immediate_post';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_payment_creation_policy ON payments;
CREATE TRIGGER check_payment_creation_policy
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION guard_payment_creation_policy();
