import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../prisma/migrations/202608200001_otp_operator_role/migration.sql', import.meta.url),
  'utf8',
);

describe('OTP operator system-role migration', () => {
  it('fails closed on a conflicting custom role and installs the exact allowlist', () => {
    expect(sql).toContain("code = 'OTP_OPERATOR' AND is_system = false");
    expect(sql).toContain("RAISE EXCEPTION 'OTP_OPERATOR is a reserved system role code'");
    expect(sql).toContain("('messaging.otp.read', 'O')");
    expect(sql).toContain("('messaging.otp.manage', 'O')");
    expect(sql).toContain("('me.profile.update', 'S')");
    expect(sql).toContain('DELETE FROM role_permission_grants');
  });
});
