import { describe, expect, it } from 'vitest';
import type { AcademyRecord, AcademyResource } from '@/api/academy/models';
import { initialActionValues } from '@/features/academy/academy-action-values';
import {
  type AcademyAction,
  type ActionTarget,
  actionPermission,
  getActionFields,
  recordActions,
  validateAction,
} from '@/features/academy/actions';
import { getAcademyCopy } from '@/i18n/academy-copy';

const copy = getAcademyCopy('en');
const row = (status: string, id = 'row-1'): AcademyRecord => ({
  id,
  name: 'Record',
  code: 'REC-1',
  status,
  version: 3,
  data: { id, name: 'Record', status, version: 3 },
});

describe('academy action state machines', () => {
  it.each<[AcademyResource, string, AcademyAction[]]>([
    ['leads', 'NEW', ['edit', 'assign', 'claim', 'addActivity', 'open', 'lose', 'disqualify']],
    ['leads', 'WON', ['edit', 'assign', 'claim', 'addActivity']],
    ['registrations', 'PENDING', ['approve', 'reject']],
    ['registrations', 'APPROVED', []],
    ['enrollments', 'DRAFT', ['submit', 'activate']],
    [
      'enrollments',
      'ACTIVE',
      ['transfer', 'postpone', 'complete', 'requestCancellation', 'retake'],
    ],
    ['enrollments', 'CANCELLED', []],
    ['versions', 'DRAFT', ['replaceCurriculum', 'publish']],
    ['versions', 'ARCHIVED', []],
    ['cohorts', 'PLANNED', ['edit', 'cancelCohort']],
    ['cohorts', 'COMPLETED', []],
  ])('%s in %s exposes only valid transitions', (resource, status, expected) => {
    expect(recordActions(resource, row(status))).toEqual(expected);
  });

  it('maps owner commands to the matching backend permissions', () => {
    expect(actionPermission('leads', 'win')).toBe('leads.convert');
    expect(actionPermission('students', 'merge')).toBe('students.merge');
    expect(actionPermission('registrations', 'approve')).toBe('students.registration.manage');
    expect(actionPermission('enrollments', 'approveCancellation')).toBe(
      'enrollments.cancel.approve',
    );
    expect(actionPermission('programs', 'createVersion')).toBe('academic.programs.manage');
    expect(actionPermission('cohorts', 'activate')).toBe('academic.cohorts.manage');
    expect(actionPermission('stages', 'edit')).toBe('leads.assign');
  });
});

describe('academy form contracts', () => {
  it('offers starting only for a filled group and requires a group target but not dates', () => {
    expect(
      recordActions('cohorts', { ...row('PLANNED'), data: { intakeStatus: 'READY_TO_START' } }),
    ).toEqual(['edit', 'activate', 'cancelCohort']);
    expect(
      recordActions('cohorts', { ...row('PLANNED'), data: { intakeStatus: 'COLLECTING' } }),
    ).not.toContain('activate');
    const target: ActionTarget = { resource: 'cohorts', action: 'create' };
    const values = {
      code: 'NEXT-1',
      programId: 'program-1',
      programVersionId: 'version-1',
      capacity: '12',
    };
    expect(validate(target, values)).toEqual({});
    expect(validate(target, { ...values, capacity: '' })).toMatchObject({
      capacity: copy.required,
    });
    expect(getActionFields(target).find(({ key }) => key === 'capacity')?.label).toBe(
      'cohortTarget',
    );
    expect(
      getActionFields({ resource: 'rooms', action: 'create' }).find(({ key }) => key === 'capacity')
        ?.label,
    ).not.toBe('cohortTarget');
  });
  function validate(target: ActionTarget, values: Record<string, string>) {
    return validateAction(target, values, copy, [], [], false);
  }

  it('requires the correct lead identity fields and validates contact data', () => {
    const target: ActionTarget = { resource: 'leads', action: 'create' };
    expect(getActionFields(target).map(({ key }) => key)).toEqual([
      'name',
      'email',
      'phone',
      'stageId',
      'source',
      'nextActionAt',
    ]);
    expect(validate(target, { name: 'A', email: 'bad-email' })).toMatchObject({
      name: copy.tooShort,
      email: copy.emailInvalid,
    });
    expect(
      validate(target, { name: 'Valid lead', nextActionAt: '2026-04-24T00:30' }),
    ).toMatchObject({ nextActionAt: copy.dateInvalid });
  });

  it('prefills Academy datetime controls in Cairo time', () => {
    expect(
      initialActionValues({
        resource: 'leads',
        action: 'edit',
        row: {
          ...row('OPEN'),
          data: { nextActionAt: '2026-09-08T15:00:00.000Z' },
        },
      }).nextActionAt,
    ).toBe('2026-09-08T18:00');
  });

  it('enforces corporate billing, cohort dates and positive capacities', () => {
    expect(
      validate(
        { resource: 'enrollments', action: 'create' },
        { studentPersonId: 'student-1', cohortId: 'cohort-1', kind: 'CORPORATE' },
      ),
    ).toMatchObject({ billingAccountId: copy.required });
    expect(
      validate(
        { resource: 'cohorts', action: 'create' },
        {
          code: 'SPRING-1',
          programId: 'program-1',
          programVersionId: 'version-1',
          startsOn: '2026-10-10',
          endsOn: '2026-10-01',
          capacity: '0',
        },
      ),
    ).toMatchObject({ endsOn: copy.datesInvalid, capacity: copy.numberInvalid });
  });

  it('requires real approval evidence and safe merge confirmation', () => {
    expect(
      validate({ resource: 'registrations', action: 'approve' }, { verificationReference: 'x' }),
    ).toMatchObject({ verificationReference: copy.proofInvalid });
    expect(
      validateAction(
        { resource: 'students', action: 'merge', row: row('ACTIVE', 'student-1') },
        { targetPersonId: 'student-1', reason: 'Duplicate records found' },
        copy,
        [],
        [],
        true,
      ),
    ).toMatchObject({ targetPersonId: copy.confirmMerge });
  });

  it('rejects duplicate curriculum modules and multiple primary contacts', () => {
    expect(
      validateAction(
        { resource: 'versions', action: 'replaceCurriculum', row: row('DRAFT') },
        {},
        copy,
        [
          { moduleId: 'module-1', required: true },
          { moduleId: 'module-1', required: false },
        ],
        [],
        false,
      ),
    ).toMatchObject({ curriculum: copy.moduleRequired });
    expect(
      validateAction(
        { resource: 'students', action: 'editContacts', row: row('ACTIVE') },
        {},
        copy,
        [],
        [
          { type: 'EMAIL', value: 'one@example.com', isPrimary: true },
          { type: 'EMAIL', value: 'two@example.com', isPrimary: true },
        ],
        false,
      ),
    ).toMatchObject({ contacts: copy.contactInvalid });
  });
});
