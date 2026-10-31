import type { PlgRequestInit } from '@academyops/api-client/http';
import * as cohorts from '@/api/generated/academic-cohorts/academic-cohorts';
import type {
  ActionTarget,
  ContactEntry,
  CurriculumEntry,
  FormValues,
} from '@/features/academy/actions';
import { record, textValue } from './models';

export type AcademyCommandInput = {
  target: ActionTarget;
  values: FormValues;
  branchId?: string;
  idempotencyKey: string;
  curriculum: CurriculumEntry[];
  contacts: ContactEntry[];
  confirmedDistinctPersonIds?: string[];
};

type RequiredCommandValues = FormValues & {
  code: string;
  cohortId: string;
  effectiveFrom: string;
  gender: string;
  kind: string;
  name: string;
  nextActionAt: string;
  note: string;
  occurredAt: string;
  ordinal: string;
  programVersionId: string;
  programVersionModuleId: string;
  reason: string;
  studentPersonId: string;
  targetCohortId: string;
  targetPersonId: string;
  type: string;
  userId: string;
  verificationReference: string;
};

export type AcademyCommandContext = {
  input: AcademyCommandInput;
  target: ActionTarget;
  values: FormValues;
  v: RequiredCommandValues;
  branchId?: string;
  idempotencyKey: string;
  id: string;
  request: PlgRequestInit;
  keyed: PlgRequestInit;
  reason: { reason: string };
  curriculum: { modules: Array<{ moduleId: string; required: boolean; ordinal: number }> };
  requireBranch: () => string;
  enrollmentData: () => Promise<{
    programVersionId: string;
    homeBranchId: string;
    cohortId: string;
    kind: 'CORPORATE' | 'INDIVIDUAL';
    billingAccountId?: string;
  }>;
};

export function createCommandContext(input: AcademyCommandInput): AcademyCommandContext {
  const { target, values, branchId, idempotencyKey } = input;
  const { action, row } = target;
  const v: RequiredCommandValues = {
    ...values,
    code: values.code ?? '',
    cohortId: values.cohortId ?? '',
    effectiveFrom: values.effectiveFrom ?? '',
    gender: values.gender ?? '',
    kind: values.kind ?? '',
    name: values.name ?? '',
    nextActionAt: values.nextActionAt ?? '',
    note: values.note ?? '',
    occurredAt: values.occurredAt ?? '',
    ordinal: values.ordinal ?? '',
    programVersionId: values.programVersionId ?? '',
    programVersionModuleId: values.programVersionModuleId ?? '',
    reason: values.reason ?? '',
    studentPersonId: values.studentPersonId ?? '',
    targetCohortId: values.targetCohortId ?? '',
    targetPersonId: values.targetPersonId ?? '',
    type: values.type ?? '',
    userId: values.userId ?? '',
    verificationReference: values.verificationReference ?? '',
  };
  const id = row?.id ?? '';
  const needsVersion = row && action !== 'approveCancellation' && action !== 'rejectCancellation';
  const request: PlgRequestInit = needsVersion
    ? { headers: { 'If-Match': String(row.version) } }
    : {};
  if (needsVersion && (!Number.isSafeInteger(row.version) || row.version < 1))
    throw new Error('Record version is required');
  const requireBranch = () => {
    if (!branchId) throw new Error('Branch is required');
    return branchId;
  };
  return {
    input,
    target,
    values,
    v,
    ...(branchId ? { branchId } : {}),
    idempotencyKey,
    id,
    request,
    keyed: { ...request, idempotencyKey },
    reason: { reason: v.reason.trim() },
    curriculum: {
      modules: input.curriculum.map((item, index) => ({
        moduleId: item.moduleId,
        required: item.required,
        ordinal: index + 1,
      })),
    },
    requireBranch,
    enrollmentData: async () => {
      const selected = record((await cohorts.cohortsControllerReadV1(v.cohortId)).data);
      return {
        programVersionId: textValue(selected.programVersionId),
        homeBranchId: textValue(selected.owningBranchId) || requireBranch(),
        cohortId: v.cohortId,
        kind: v.kind === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
        ...optional(v, ['billingAccountId']),
      };
    },
  };
}

export function optional(values: FormValues, keys: string[]): Record<string, string> {
  return Object.fromEntries(
    keys.filter((key) => values[key]?.trim()).map((key) => [key, values[key]?.trim() ?? '']),
  );
}

export function numberValue(values: FormValues, key: string): Record<string, number> {
  return values[key] ? { [key]: Number(values[key]) } : {};
}
