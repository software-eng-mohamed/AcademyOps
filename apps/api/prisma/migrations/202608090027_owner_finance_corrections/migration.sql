-- 1. Delete any existing non-Owner grants for the four permissions across all organizations/custom roles
DELETE FROM role_permission_grants rpg
USING roles r
WHERE rpg.role_id = r.id
  AND rpg.organization_id = r.organization_id
  AND rpg.permission_code IN (
    'payments.reverse.request',
    'payments.reverse.approve',
    'refunds.request',
    'refunds.approve'
  )
  AND r.code <> 'OWNER';

-- 2. Create/update the system OPERATIONS role for every existing organization
INSERT INTO roles (id, organization_id, code, name_ar, name_en, is_system, version, created_at, updated_at)
SELECT gen_random_uuid(), id, 'OPERATIONS', 'التشغيل', 'Operations', true, 1, NOW(), NOW()
FROM organizations
ON CONFLICT (organization_id, code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  is_system = true,
  updated_at = NOW();

-- 3. Delete any obsolete or incorrect role permission grants for the system OPERATIONS role
DELETE FROM role_permission_grants
WHERE role_id IN (SELECT id FROM roles WHERE code = 'OPERATIONS')
  AND (permission_code, scope) NOT IN (
    VALUES
      ('academic.catalog.read', 'O'),
      ('academic.programs.manage', 'O'),
      ('students.read_basic', 'B'),
      ('students.read_contact', 'B'),
      ('students.create', 'B'),
      ('students.update', 'B'),
      ('business_accounts.read', 'B'),
      ('academic.cohorts.manage', 'B'),
      ('academic.sessions.manage', 'B'),
      ('enrollments.read', 'B'),
      ('enrollments.create', 'B'),
      ('enrollments.submit', 'B'),
      ('enrollments.activate', 'B'),
      ('enrollments.transfer', 'B'),
      ('enrollments.postpone', 'B'),
      ('enrollments.resume', 'B'),
      ('enrollments.complete', 'B'),
      ('enrollments.retake', 'B'),
      ('enrollments.cancel.request', 'B'),
      ('enrollments.cancel.approve', 'B'),
      ('pricing.read', 'B'),
      ('finance.balance.read', 'B'),
      ('attendance.read', 'B'),
      ('attendance.qr.open', 'B'),
      ('attendance.record_manual', 'B'),
      ('attendance.correct', 'B'),
      ('attendance.correct_after_lock', 'B'),
      ('certificates.read', 'B'),
      ('certificates.issue', 'B'),
      ('certificates.upload', 'B'),
      ('certificates.collect', 'B'),
      ('reports.operations.read', 'B'),
      ('me.profile.update', 'S')
  );

-- 4. Install exactly the grants for system OPERATIONS role without duplicating rows
WITH target_roles AS (
  SELECT id AS role_id, organization_id
  FROM roles
  WHERE code = 'OPERATIONS'
),
new_grants (permission_code, scope) AS (
  VALUES
    ('academic.catalog.read', 'O'),
    ('academic.programs.manage', 'O'),
    ('students.read_basic', 'B'),
    ('students.read_contact', 'B'),
    ('students.create', 'B'),
    ('students.update', 'B'),
    ('business_accounts.read', 'B'),
    ('academic.cohorts.manage', 'B'),
    ('academic.sessions.manage', 'B'),
    ('enrollments.read', 'B'),
    ('enrollments.create', 'B'),
    ('enrollments.submit', 'B'),
    ('enrollments.activate', 'B'),
    ('enrollments.transfer', 'B'),
    ('enrollments.postpone', 'B'),
    ('enrollments.resume', 'B'),
    ('enrollments.complete', 'B'),
    ('enrollments.retake', 'B'),
    ('enrollments.cancel.request', 'B'),
    ('enrollments.cancel.approve', 'B'),
    ('pricing.read', 'B'),
    ('finance.balance.read', 'B'),
    ('attendance.read', 'B'),
    ('attendance.qr.open', 'B'),
    ('attendance.record_manual', 'B'),
    ('attendance.correct', 'B'),
    ('attendance.correct_after_lock', 'B'),
    ('certificates.read', 'B'),
    ('certificates.issue', 'B'),
    ('certificates.upload', 'B'),
    ('certificates.collect', 'B'),
    ('reports.operations.read', 'B'),
    ('me.profile.update', 'S')
)
INSERT INTO role_permission_grants (id, organization_id, role_id, permission_code, scope, created_at)
SELECT gen_random_uuid(), tr.organization_id, tr.role_id, ng.permission_code, ng.scope, NOW()
FROM target_roles tr
CROSS JOIN new_grants ng
ON CONFLICT (organization_id, role_id, permission_code, scope) DO NOTHING;

-- 5. Add PostgreSQL trigger function and trigger to enforce Owner-only finance permissions
CREATE OR REPLACE FUNCTION guard_owner_only_finance_permissions()
RETURNS trigger AS $$
DECLARE
  role_code varchar(50);
BEGIN
  IF NEW.permission_code IN (
    'payments.reverse.request',
    'payments.reverse.approve',
    'refunds.request',
    'refunds.approve'
  ) THEN
    SELECT code INTO role_code
    FROM roles
    WHERE id = NEW.role_id AND organization_id = NEW.organization_id;

    IF role_code IS NULL OR role_code <> 'OWNER' THEN
      RAISE EXCEPTION 'Finance reversal and refund permissions are exclusive to the OWNER role'
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
