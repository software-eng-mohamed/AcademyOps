import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../prisma/migrations/202608090027_owner_finance_corrections/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Owner-only finance corrections migration static contract', () => {
  it('contains the expected SQL statements', () => {
    // 1. Delete existing non-Owner grants for the four permissions
    expect(migrationSql).toContain('DELETE FROM role_permission_grants');
    expect(migrationSql).toContain("r.code <> 'OWNER'");
    expect(migrationSql).toContain('payments.reverse.request');
    expect(migrationSql).toContain('payments.reverse.approve');
    expect(migrationSql).toContain('refunds.request');
    expect(migrationSql).toContain('refunds.approve');

    // 2. Create/update the OPERATIONS role for every organization
    expect(migrationSql).toContain("code = 'OPERATIONS'");
    expect(migrationSql).toContain('code, name_ar, name_en, is_system');
    expect(migrationSql).toContain("'OPERATIONS', 'التشغيل', 'Operations', true");
    expect(migrationSql).toContain('ON CONFLICT (organization_id, code) DO UPDATE');

    // 3. Create the trigger function and trigger to reject future mutations
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION guard_owner_only_finance_permissions()',
    );
    expect(migrationSql).toContain(
      'CREATE TRIGGER role_permission_grants_owner_only_finance_permissions',
    );
    expect(migrationSql).toContain('BEFORE INSERT OR UPDATE ON role_permission_grants');
    expect(migrationSql).toContain(
      'FOR EACH ROW EXECUTE FUNCTION guard_owner_only_finance_permissions()',
    );
  });
});
