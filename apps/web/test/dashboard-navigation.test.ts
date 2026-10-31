import { describe, expect, it } from 'vitest';
import type { CurrentUserSummaryDto } from '@/api/generated/models/currentUserSummaryDto';
import { UserPermissionGrantDtoCode } from '@/api/generated/models/userPermissionGrantDtoCode';
import type { UserPermissionGrantDtoScopesItem } from '@/api/generated/models/userPermissionGrantDtoScopesItem';
import { getPrimaryRoleCode, getVisibleNavigation } from '@/features/dashboard/navigation';

type Subject = Pick<CurrentUserSummaryDto, 'permissions' | 'roles'>;
type Scope = UserPermissionGrantDtoScopesItem;

function subject(role: string | undefined, codes: readonly string[], scope: Scope): Subject {
  return {
    permissions: codes.map((code) => ({ code: code as never, scopes: [scope] })),
    roles: role ? [{ code: role, name: role }] : [],
  };
}

function keys(user: Subject) {
  return getVisibleNavigation(user).map(({ key }) => key);
}

describe('permission-aware dashboard navigation', () => {
  it('shows the complete administration surface to the owner', () => {
    const owner = subject('OWNER', Object.values(UserPermissionGrantDtoCode), 'O');
    expect(getPrimaryRoleCode(owner)).toBe('OWNER');
    expect(keys(owner)).toEqual(
      expect.arrayContaining([
        'dashboard',
        'leads',
        'students',
        'sessions',
        'finance',
        'reports',
        'imports',
        'audit',
        'whatsapp',
        'access',
      ]),
    );
    expect(
      getVisibleNavigation(owner)
        .filter(({ group }) => ['academy', 'operations', 'finance'].includes(group ?? ''))
        .every(({ available }) => available),
    ).toBe(true);
  });

  it('enables shared Operations pages without unlocking financial management', () => {
    const operations = subject(
      'OPERATIONS',
      [
        'students.read_basic',
        'enrollments.read',
        'academic.catalog.read',
        'attendance.read',
        'payments.read',
      ],
      'B',
    );
    expect(
      getVisibleNavigation(operations)
        .filter(({ group }) => ['academy', 'operations'].includes(group ?? ''))
        .every(({ available }) => available),
    ).toBe(true);
    expect(getVisibleNavigation(operations).find(({ key }) => key === 'payments')?.available).toBe(
      false,
    );
  });

  it.each([
    {
      codes: [
        'students.read_basic',
        'enrollments.read',
        'academic.catalog.read',
        'academic.sessions.manage',
        'attendance.read',
        'certificates.read',
      ],
      hidden: 'access',
      role: 'OPERATIONS',
      scope: 'B' as const,
      visible: ['students', 'programs', 'sessions', 'attendance', 'certificates'],
    },
    {
      codes: [
        'students.read_basic',
        'enrollments.read',
        'academic.catalog.read',
        'academic.sessions.manage',
        'attendance.read',
        'certificates.read',
      ],
      hidden: 'finance',
      role: 'ACADEMIC',
      scope: 'B' as const,
      visible: ['students', 'programs', 'sessions', 'attendance', 'certificates'],
    },
    {
      codes: [
        'leads.read',
        'students.read_basic',
        'enrollments.read',
        'business_accounts.read',
        'academic.catalog.read',
      ],
      hidden: 'audit',
      role: 'RECEPTION',
      scope: 'B' as const,
      visible: ['leads', 'students', 'enrollments', 'businessAccounts'],
    },
    {
      codes: ['leads.read', 'students.read_basic', 'enrollments.read'],
      hidden: 'payments',
      role: 'SALES',
      scope: 'A' as const,
      visible: ['leads', 'students', 'enrollments'],
    },
    {
      codes: [
        'students.read_basic',
        'enrollments.read',
        'finance.reports.read',
        'payments.read',
        'invoices.read',
        'receipts.read',
      ],
      hidden: 'attendance',
      role: 'ACCOUNTS',
      scope: 'B' as const,
      visible: ['students', 'finance', 'payments', 'documents'],
    },
    {
      codes: [
        'students.read_basic',
        'enrollments.read',
        'attendance.read',
        'academic.catalog.read',
      ],
      hidden: 'finance',
      role: 'ATTENDANCE',
      scope: 'B' as const,
      visible: ['students', 'attendance'],
    },
    {
      codes: [
        'students.read_basic',
        'enrollments.read',
        'academic.catalog.read',
        'attendance.read',
        'certificates.read',
      ],
      hidden: 'access',
      role: 'TRAINER',
      scope: 'A' as const,
      visible: ['students', 'programs', 'sessions', 'attendance', 'certificates'],
    },
  ])(
    'filters the $role sidebar using its actual grants',
    ({ codes, hidden, role, scope, visible }) => {
      const navigation = keys(subject(role, codes, scope));
      expect(navigation).toEqual(expect.arrayContaining(['dashboard', ...visible]));
      expect(navigation).not.toContain(hidden);
    },
  );

  it('gives students self-service navigation without staff workspaces', () => {
    const student = subject(
      'STUDENT',
      [
        'enrollments.read',
        'academic.catalog.read',
        'attendance.read',
        'finance.balance.read',
        'certificates.read',
      ],
      'S',
    );
    expect(keys(student)).toEqual([
      'dashboard',
      'myLearning',
      'mySchedule',
      'myAttendance',
      'myFinance',
      'myCertificates',
    ]);
  });

  it('isolates the WhatsApp operator and hides overview from no-grant users', () => {
    const operator = subject('OTP_OPERATOR', ['messaging.otp.read'], 'O');
    expect(keys(operator)).toEqual(['dashboard', 'whatsapp']);
    expect(keys(subject(undefined, [], 'S'))).toEqual([]);
  });
});
