DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM roles
    WHERE code = 'OTP_OPERATOR' AND is_system = false
  ) THEN
    RAISE EXCEPTION 'OTP_OPERATOR is a reserved system role code';
  END IF;
END;
$$;

INSERT INTO roles (
  id,
  organization_id,
  code,
  name_ar,
  name_en,
  is_system,
  version,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  id,
  'OTP_OPERATOR',
  'مسؤول قناة واتساب',
  'WhatsApp OTP Operator',
  true,
  1,
  NOW(),
  NOW()
FROM organizations
ON CONFLICT (organization_id, code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  is_system = true,
  version = roles.version + 1,
  updated_at = NOW();

DELETE FROM role_permission_grants grant_row
USING roles role_row
WHERE grant_row.organization_id = role_row.organization_id
  AND grant_row.role_id = role_row.id
  AND role_row.code = 'OTP_OPERATOR';

INSERT INTO role_permission_grants (
  id,
  organization_id,
  role_id,
  permission_code,
  scope
)
SELECT
  gen_random_uuid(),
  role_row.organization_id,
  role_row.id,
  grant_row.permission_code,
  grant_row.scope
FROM roles role_row
CROSS JOIN (
  VALUES
    ('messaging.otp.read', 'O'),
    ('messaging.otp.manage', 'O'),
    ('me.profile.update', 'S')
) AS grant_row(permission_code, scope)
WHERE role_row.code = 'OTP_OPERATOR';
