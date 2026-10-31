import { describe, expect, it } from 'vitest';
import { validateManagementFields } from '@/features/management/actions';
import { validAttendancePolicy } from '@/features/management/attendance-policy-values';
import { validSessionTrainers } from '@/features/management/session-trainer-values';

const policy = {
  minimumPercent: '80',
  lockAfterMinutes: '1440',
  checkInOpensBeforeMinutes: '0',
  checkInClosesAfterMinutes: '30',
  effectiveFrom: '2026-09-05T09:00',
  effectiveTo: '',
};
describe('Operations contract validation', () => {
  it('accepts an exact minimum and a zero-minute early window', () =>
    expect(validAttendancePolicy(policy)).toBe(true));
  it.each([
    { minimumPercent: '79.99' },
    { minimumPercent: '100.01' },
    { lockAfterMinutes: '0' },
    { lockAfterMinutes: '10081' },
    { checkInOpensBeforeMinutes: '-1' },
    { checkInClosesAfterMinutes: '1441' },
    { effectiveFrom: '' },
    { effectiveTo: '2026-09-05T08:00' },
  ])('rejects invalid policy values %o', (change) =>
    expect(validAttendancePolicy({ ...policy, ...change })).toBe(false),
  );
  it('accepts distinct primary/assistant assignments and explicit removal', () => {
    expect(validSessionTrainers('[]')).toBe(true);
    expect(
      validSessionTrainers(
        JSON.stringify([
          { trainerId: 'one', role: 'PRIMARY' },
          { trainerId: 'two', role: 'PRIMARY' },
        ]),
      ),
    ).toBe(true);
    expect(
      validSessionTrainers(
        JSON.stringify([
          { trainerId: 'one', role: 'PRIMARY' },
          { trainerId: 'two', role: 'ASSISTANT' },
        ]),
      ),
    ).toBe(true);
  });
  it('rejects duplicate, empty, malformed and invalid-role assignments', () => {
    for (const value of [
      '{}',
      'x',
      JSON.stringify([{ trainerId: '', role: 'PRIMARY' }]),
      JSON.stringify([
        { trainerId: 'one', role: 'PRIMARY' },
        { trainerId: 'one', role: 'ASSISTANT' },
      ]),
      JSON.stringify([
        { trainerId: 'one', role: 'PRIMARY' },
        { trainerId: 'two', role: 'INVALID' },
      ]),
    ])
      expect(validSessionTrainers(value)).toBe(false);
  });
  it('enforces backend note length before completing a session', () =>
    expect(validateManagementFields('completeSession', { note: 'Hi' })).toHaveProperty('note'));
});
