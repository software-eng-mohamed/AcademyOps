import type { AcademyRecord, AcademyResource } from '@/api/academy/models';
import type { AcademyCopyKey } from '@/i18n/academy-copy';

export type AcademyAction =
  | 'create'
  | 'edit'
  | 'editContacts'
  | 'merge'
  | 'approve'
  | 'reject'
  | 'open'
  | 'qualify'
  | 'lose'
  | 'disqualify'
  | 'reopen'
  | 'win'
  | 'claim'
  | 'assign'
  | 'addActivity'
  | 'submit'
  | 'activate'
  | 'postpone'
  | 'resume'
  | 'complete'
  | 'requestCancellation'
  | 'approveCancellation'
  | 'rejectCancellation'
  | 'transfer'
  | 'retake'
  | 'approveRetake'
  | 'rejectRetake'
  | 'createVersion'
  | 'replaceCurriculum'
  | 'publish'
  | 'archive'
  | 'restore'
  | 'plan'
  | 'cancelCohort'
  | 'deactivate'
  | 'enable';
export type LookupKind =
  | AcademyResource
  | 'assignees'
  | 'publishedVersions'
  | 'curriculumModules'
  | 'cohortModules'
  | 'businessAccounts';
export type FormField = {
  key: string;
  label?: AcademyCopyKey;
  kind?:
    | 'text'
    | 'email'
    | 'phone'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'textarea'
    | 'select'
    | 'lookup';
  optional?: boolean;
  min?: number;
  max?: number;
  choices?: string[];
  lookup?: LookupKind;
};
export type FormValues = Record<string, string>;
export type CurriculumEntry = { moduleId: string; required: boolean };
export type ContactEntry = { type: 'EMAIL' | 'PHONE'; value: string; isPrimary: boolean };
export type ActionTarget = {
  resource: AcademyResource;
  action: AcademyAction;
  row?: AcademyRecord;
};

export function recordActions(resource: AcademyResource, row: AcademyRecord): AcademyAction[] {
  const state = row.status;
  switch (resource) {
    case 'leads':
      return [
        'edit',
        'assign',
        ...(row.data.assignedUserId ? [] : (['claim'] as const)),
        'addActivity',
        ...((
          {
            NEW: ['open', 'lose', 'disqualify'],
            OPEN: ['qualify', 'lose', 'disqualify'],
            QUALIFIED: ['win', 'lose', 'disqualify'],
            LOST: ['reopen'],
            DISQUALIFIED: ['reopen'],
          } as Record<string, AcademyAction[]>
        )[state] ?? []),
      ];
    case 'students':
      return ['edit', 'editContacts', 'merge'];
    case 'registrations':
      return state === 'PENDING' ? ['approve', 'reject'] : [];
    case 'programs':
      return [
        'edit',
        ...(state === 'ACTIVE' ? (['createVersion', 'archive'] as const) : (['restore'] as const)),
      ];
    case 'versions':
      return state === 'DRAFT'
        ? ['replaceCurriculum', 'publish']
        : state === 'PUBLISHED'
          ? ['archive']
          : [];
    case 'cohorts':
      return [
        ...(['DRAFT', 'PLANNED'].includes(state) ? (['edit'] as const) : []),
        ...((
          {
            DRAFT: ['plan', 'cancelCohort'],
            PLANNED:
              row.data.intakeStatus === 'READY_TO_START'
                ? ['activate', 'cancelCohort']
                : ['cancelCohort'],
            ACTIVE: ['complete', 'cancelCohort'],
          } as Record<string, AcademyAction[]>
        )[state] ?? []),
      ];
    case 'enrollments':
      return (
        (
          {
            DRAFT: ['submit', 'activate'],
            PENDING_APPROVAL: ['activate', 'reject'],
            ACTIVE: ['transfer', 'postpone', 'complete', 'requestCancellation', 'retake'],
            POSTPONED: ['transfer', 'resume', 'complete', 'requestCancellation', 'retake'],
            COMPLETED: ['retake'],
          } as Record<string, AcademyAction[]>
        )[state] ?? []
      );
    case 'rooms':
    case 'trainers':
    case 'modules':
    case 'stages':
      return ['edit', state === 'ACTIVE' ? 'deactivate' : 'enable'];
    default:
      return [];
  }
}

export function actionPermission(resource: AcademyResource, action: AcademyAction): string {
  if (resource === 'registrations') return 'students.registration.manage';
  if (
    resource === 'programs' ||
    resource === 'versions' ||
    resource === 'modules' ||
    resource === 'trainers'
  )
    return 'academic.programs.manage';
  if (resource === 'rooms' || resource === 'cohorts') return 'academic.cohorts.manage';
  if (resource === 'stages') return 'leads.assign';
  if (resource === 'students')
    return action === 'merge'
      ? 'students.merge'
      : action === 'create'
        ? 'students.create'
        : 'students.update';
  if (resource === 'leads')
    return `leads.${action === 'create' ? 'create' : action === 'claim' ? 'claim' : action === 'assign' ? 'assign' : action === 'win' ? 'convert' : 'update'}`;
  return `enrollments.${action === 'approveCancellation' || action === 'rejectCancellation' ? 'cancel.approve' : action === 'requestCancellation' ? 'cancel.request' : action === 'reject' ? 'activate' : action === 'approveRetake' || action === 'rejectRetake' ? 'retake' : action}`;
}

export { getActionFields } from './action-fields';
export { validateAction } from './action-validation';
