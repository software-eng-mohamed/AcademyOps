import { describe, expect, it } from 'vitest';
import {
  defaultRoleGrants,
  OWNER_ONLY_PERMISSIONS,
  requiresStepUpMfa,
  type DefaultRoleCode,
  type PermissionCode,
  type AccessScope,
} from '../src/index.js';

describe('Operations role permissions contract', () => {
  it('keeps OTP channel management organization-scoped and step-up protected', () => {
    expect(defaultRoleGrants.OWNER).toContainEqual(['messaging.otp.read', 'O']);
    expect(defaultRoleGrants.OWNER).toContainEqual(['messaging.otp.manage', 'O']);
    expect(defaultRoleGrants.OTP_OPERATOR).toEqual([
      ['messaging.otp.read', 'O'],
      ['messaging.otp.manage', 'O'],
      ['me.profile.update', 'S'],
    ]);
    expect(requiresStepUpMfa.has('messaging.otp.manage')).toBe(true);
    expect(requiresStepUpMfa.has('messaging.otp.read')).toBe(false);
  });

  it('has the exact Operations allowlist and scopes', () => {
    const operationsGrants = defaultRoleGrants.OPERATIONS;

    const actualMap = new Map(operationsGrants);

    const expectedGrants: [PermissionCode, AccessScope][] = [
      ['academic.catalog.read', 'O'],
      ['academic.programs.manage', 'O'],
      ['students.read_basic', 'B'],
      ['students.read_contact', 'B'],
      ['students.create', 'B'],
      ['students.update', 'B'],
      ['business_accounts.read', 'B'],
      ['academic.cohorts.manage', 'B'],
      ['academic.sessions.manage', 'B'],
      ['enrollments.read', 'B'],
      ['enrollments.create', 'B'],
      ['enrollments.submit', 'B'],
      ['enrollments.activate', 'B'],
      ['enrollments.transfer', 'B'],
      ['enrollments.postpone', 'B'],
      ['enrollments.resume', 'B'],
      ['enrollments.complete', 'B'],
      ['enrollments.retake', 'B'],
      ['enrollments.cancel.request', 'B'],
      ['enrollments.cancel.approve', 'B'],
      ['pricing.read', 'B'],
      ['finance.balance.read', 'B'],
      ['attendance.read', 'B'],
      ['attendance.qr.open', 'B'],
      ['attendance.record_manual', 'B'],
      ['attendance.correct', 'B'],
      ['attendance.correct_after_lock', 'B'],
      ['certificates.read', 'B'],
      ['certificates.issue', 'B'],
      ['certificates.upload', 'B'],
      ['certificates.collect', 'B'],
      ['reports.operations.read', 'B'],
      ['me.profile.update', 'S'],
    ];

    expect(operationsGrants.length).toBe(expectedGrants.length);

    for (const [perm, scope] of expectedGrants) {
      expect(actualMap.get(perm)).toBe(scope);
    }
  });

  it('explicitly forbids Operations from having financial, updates, or admin capabilities', () => {
    const operationsGrants = defaultRoleGrants.OPERATIONS;
    const actualPerms = new Set(operationsGrants.map(([perm]) => perm));

    const forbiddenPermissions: PermissionCode[] = [
      'payments.record',
      'payments.checkout',
      'discounts.approve_tier1',
      'discounts.approve_tier2',
      'invoices.read',
      'invoices.issue',
      'receipts.read',
      'receipts.issue',
      'finance.reports.read',
      'finance.reports.export',
      'exports.sensitive',
      'imports.preview',
      'imports.execute',
      'imports.finalize',
      'users.manage',
      'roles.manage',
      'branches.manage',
      'students.update_sensitive',
      'students.merge',
      'audit.read',
      'payments.reverse.request',
      'payments.reverse.approve',
      'refunds.request',
      'refunds.approve',
      'students.registration.manage',
    ];

    for (const perm of forbiddenPermissions) {
      expect(actualPerms.has(perm)).toBe(false);
    }
  });
});

describe('Student registration permission invariants', () => {
  it('assigns students.registration.manage exclusively to OWNER and requires step-up MFA', () => {
    const roles = Object.keys(defaultRoleGrants) as DefaultRoleCode[];

    for (const role of roles) {
      const grants = defaultRoleGrants[role];
      const hasRegManage = grants.some(([perm]) => perm === 'students.registration.manage');

      if (role === 'OWNER') {
        expect(hasRegManage).toBe(true);
        expect(grants).toContainEqual(['students.registration.manage', 'O']);
      } else {
        expect(hasRegManage).toBe(false);
      }
    }

    expect(requiresStepUpMfa.has('students.registration.manage')).toBe(true);
  });
});

describe('Owner-only invariant contract', () => {
  it('restricts the five finance permissions exclusively to OWNER', () => {
    expect(OWNER_ONLY_PERMISSIONS.length).toBe(5);
    const roles = Object.keys(defaultRoleGrants) as DefaultRoleCode[];

    for (const role of roles) {
      const grants = defaultRoleGrants[role];
      const hasFinancePermission = grants.some(([perm]) =>
        (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(perm),
      );

      if (role === 'OWNER') {
        expect(hasFinancePermission).toBe(true);
        for (const perm of OWNER_ONLY_PERMISSIONS) {
          expect(grants).toContainEqual([perm, 'O']);
        }
      } else {
        expect(hasFinancePermission).toBe(false);
      }
    }
  });

  it('requires step-up MFA for all five owner-only permissions', () => {
    for (const perm of OWNER_ONLY_PERMISSIONS) {
      expect(requiresStepUpMfa.has(perm)).toBe(true);
    }
  });
});

describe('Accounts role permissions contract', () => {
  it('has the exact Accounts allowlist and scopes', () => {
    const accountsGrants = defaultRoleGrants.ACCOUNTS;
    const actualMap = new Map(accountsGrants);

    const expectedGrants: [PermissionCode, AccessScope][] = [
      ['students.read_basic', 'B'],
      ['students.read_contact', 'B'],
      ['academic.catalog.read', 'B'],
      ['enrollments.read', 'B'],
      ['pricing.read', 'B'],
      ['finance.balance.read', 'B'],
      ['payments.read', 'B'],
      ['payments.record', 'B'],
      ['payments.checkout', 'B'],
      ['invoices.read', 'B'],
      ['receipts.read', 'B'],
      ['finance.reports.read', 'B'],
      ['me.profile.update', 'S'],
    ];

    expect(accountsGrants.length).toBe(expectedGrants.length);
    for (const [perm, scope] of expectedGrants) {
      expect(actualMap.get(perm)).toBe(scope);
    }
  });
});
