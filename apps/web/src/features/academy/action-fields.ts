import type { ActionTarget, FormField, LookupKind } from './actions';

const reason = (min = 5): FormField => ({ key: 'reason', kind: 'textarea', min, max: 1000 });
const code: FormField = { key: 'code', min: 2, max: 50 };
const name: FormField = { key: 'name', min: 2, max: 200 };
const lookup = (key: string, kind: LookupKind, optional = false): FormField => ({
  key,
  kind: 'lookup',
  lookup: kind,
  optional,
});
const person: FormField[] = [
  { ...name, label: 'personName' },
  { key: 'email', kind: 'email', optional: true, max: 320 },
  { key: 'phone', kind: 'phone', optional: true, min: 5, max: 40 },
];
const cohortFields: FormField[] = [
  { ...name, optional: true },
  { key: 'startsOn', kind: 'date', optional: true },
  { key: 'endsOn', kind: 'date', optional: true },
  { key: 'capacity', label: 'cohortTarget', kind: 'number' },
];
const enrollmentFields: FormField[] = [
  lookup('cohortId', 'cohorts'),
  { key: 'kind', kind: 'select', choices: ['INDIVIDUAL', 'CORPORATE'] },
  lookup('billingAccountId', 'businessAccounts', true),
];

export function getActionFields({ resource, action }: ActionTarget): FormField[] {
  if (action === 'merge') return [lookup('targetPersonId', 'students'), reason(10)];
  if (action === 'editContacts' || action === 'createVersion' || action === 'replaceCurriculum')
    return [];
  if (action === 'approve') return [{ key: 'verificationReference', min: 10, max: 80 }];
  if (action === 'reject' && resource === 'registrations') return [{ ...reason(), max: 500 }];
  if (action === 'assign') return [lookup('userId', 'assignees')];
  if (action === 'addActivity')
    return [
      { key: 'type', kind: 'select', choices: ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE'] },
      { key: 'occurredAt', kind: 'datetime-local', optional: true },
      { key: 'note', label: 'activityNote', kind: 'textarea', min: 2, max: 2000 },
    ];
  if (action === 'win') return enrollmentFields;
  if (action === 'transfer') return [lookup('targetCohortId', 'cohorts'), reason()];
  if (action === 'retake')
    return [
      lookup('programVersionModuleId', 'curriculumModules'),
      lookup('retakeCohortId', 'cohorts', true),
      lookup('targetCohortModuleId', 'cohortModules', true),
      reason(),
    ];
  if (
    [
      'lose',
      'disqualify',
      'reopen',
      'postpone',
      'resume',
      'complete',
      'requestCancellation',
      'approveCancellation',
      'rejectCancellation',
      'reject',
      'approveRetake',
      'rejectRetake',
      'plan',
      'cancelCohort',
    ].includes(action)
  )
    return [reason()];
  if (action === 'activate')
    return resource === 'cohorts'
      ? [reason()]
      : [{ key: 'note', kind: 'textarea', optional: true, min: 2, max: 1000 }];
  if (action === 'publish') return [{ key: 'effectiveFrom', kind: 'date' }];
  if (action === 'archive' && resource === 'versions') return [reason()];
  if (action !== 'create' && action !== 'edit') return [];
  const creating = action === 'create';
  switch (resource) {
    case 'leads':
      return [
        ...(creating ? person : []),
        lookup('stageId', 'stages', true),
        { key: 'source', optional: true, min: 2, max: 80 },
        { key: 'nextActionAt', kind: 'datetime-local', optional: true },
      ];
    case 'students':
      return [
        ...(creating ? person : [{ ...name, label: 'personName' as const }]),
        { key: 'birthDate', kind: 'date', optional: true },
        { key: 'gender', kind: 'select', choices: ['MALE', 'FEMALE'], optional: true },
        ...(creating ? [{ key: 'legacyCode', optional: true, max: 80 } satisfies FormField] : []),
      ];
    case 'enrollments':
      return [lookup('studentPersonId', 'students'), ...enrollmentFields];
    case 'programs':
    case 'modules':
      return [...(creating ? [code] : []), name];
    case 'cohorts':
      return [
        ...(creating
          ? [
              { ...code, max: 80 },
              lookup('programId', 'programs'),
              lookup('programVersionId', 'publishedVersions'),
            ]
          : []),
        ...cohortFields,
      ];
    case 'rooms':
      return [
        ...(creating ? [code] : []),
        name,
        { key: 'capacity', kind: 'number', optional: true },
      ];
    case 'trainers':
      return [
        ...(creating ? [{ ...name, label: 'personName' as const }] : []),
        {
          key: 'biographyEn',
          kind: 'textarea',
          optional: true,
          min: 2,
          max: 2000,
          label: 'biography' as const,
        },
      ];
    case 'stages':
      return [...(creating ? [code] : []), name, { key: 'ordinal', kind: 'number' }];
    default:
      return [];
  }
}
