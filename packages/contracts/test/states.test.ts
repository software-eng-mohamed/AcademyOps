import { describe, expect, it } from 'vitest';
import {
  calculateAttendanceRatio,
  defaultRoleGrants,
  DomainTransitionError,
  transitionEnrollment,
  transitionLead,
  transitionPayment,
  transitionAttendanceWindow,
} from '../src/index.js';

describe('domain state machines', () => {
  it('allows an approved enrollment path', () => {
    expect(transitionEnrollment('DRAFT', 'submit')).toBe('PENDING_APPROVAL');
    expect(transitionEnrollment('PENDING_APPROVAL', 'activate')).toBe('ACTIVE');
  });

  it('allows attendance window transitions', () => {
    expect(transitionAttendanceWindow('SCHEDULED', 'open')).toBe('OPEN');
    expect(transitionAttendanceWindow('OPEN', 'close')).toBe('LOCKED');
    expect(transitionAttendanceWindow('CLOSED', 'lock')).toBe('LOCKED');
  });

  it('rejects terminal transitions', () => {
    expect(() => transitionLead('WON', 'reopen')).toThrow(DomainTransitionError);
    expect(() => transitionPayment('REVERSED', 'post')).toThrow(DomainTransitionError);
  });
});

describe('default permission matrix', () => {
  it('requires owner-level scope for tier two discounts', () => {
    expect(defaultRoleGrants.OWNER).toContainEqual(['discounts.approve_tier2', 'O']);
    expect(defaultRoleGrants.OWNER).toContainEqual(['messaging.otp.manage', 'O']);
    expect(defaultRoleGrants.ACCOUNTS).not.toContainEqual(['discounts.approve_tier2', 'B']);
  });

  it('keeps student grants self-scoped', () => {
    expect(defaultRoleGrants.STUDENT.every(([, scope]) => scope === 'S')).toBe(true);
    expect(defaultRoleGrants.STUDENT).toContainEqual(['payments.checkout', 'S']);
  });

  it('allows accounts to create Paymob checkout only inside assigned branches', () => {
    expect(defaultRoleGrants.ACCOUNTS).toContainEqual(['payments.checkout', 'B']);
  });

  it('limits enrollment completion to academic staff and owners by default', () => {
    expect(defaultRoleGrants.ACADEMIC).toContainEqual(['enrollments.complete', 'B']);
    expect(defaultRoleGrants.OWNER).toContainEqual(['enrollments.complete', 'O']);
    expect(defaultRoleGrants.RECEPTION).not.toContainEqual(['enrollments.complete', 'B']);
  });
});

describe('attendance policy', () => {
  it('counts present and late, excludes excused, and applies makeup once', () => {
    const ratio = calculateAttendanceRatio(
      [
        { recordId: 'present', status: 'PRESENT' },
        { recordId: 'late', status: 'LATE' },
        { recordId: 'missed', status: 'ABSENT' },
        { recordId: 'excused', status: 'EXCUSED' },
        { recordId: 'makeup', status: 'PRESENT' },
      ],
      [
        { missedRecordId: 'missed', makeupRecordId: 'makeup' },
        { missedRecordId: 'missed', makeupRecordId: 'makeup' },
      ],
    );

    expect(ratio).toEqual({ numerator: 4, denominator: 4, ratio: 1 });
  });
});
