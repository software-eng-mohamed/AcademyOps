import * as branches from '@/api/generated/branches/branches';
import * as imports from '@/api/generated/imports/imports';
import * as channel from '@/api/generated/messaging/messaging';
import type { PermissionGrantDto } from '@/api/generated/models/permissionGrantDto';
import * as roles from '@/api/generated/roles/roles';
import * as users from '@/api/generated/users/users';
import type { SystemRecord } from '@/features/system/config';

export type AccessAction =
  | 'createUser'
  | 'createRole'
  | 'createBranch'
  | 'editUser'
  | 'editRole'
  | 'editBranch'
  | 'replaceRoles'
  | 'replaceBranches'
  | 'replaceGrants';
export type AccessValues = {
  name: string;
  code: string;
  email: string;
  employeeCode: string;
  preferredLocale: 'ar' | 'en';
  status: 'ACTIVE' | 'SUSPENDED';
  isActive: boolean;
  reason: string;
  roleIds: string[];
  branchIds: string[];
  grants: PermissionGrantDto[];
};
export function accessErrors(action: AccessAction, values: AccessValues): string[] {
  const errors: string[] = [];
  if (
    ['createUser', 'createRole', 'createBranch', 'editRole', 'editBranch'].includes(action) &&
    (values.name.trim().length < 2 || values.name.trim().length > 200)
  )
    errors.push('name');
  if (
    ['createRole', 'createBranch'].includes(action) &&
    !(
      action === 'createRole' ? /^[A-Za-z][A-Za-z0-9_-]{1,49}$/ : /^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/
    ).test(values.code)
  )
    errors.push('code');
  if (action === 'createUser' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.push('email');
  if (
    action === 'createUser' &&
    values.employeeCode &&
    (values.employeeCode.trim().length < 2 || values.employeeCode.trim().length > 50)
  )
    errors.push('employeeCode');
  if (
    ['editUser', 'replaceRoles', 'replaceBranches'].includes(action) &&
    (values.reason.trim().length < 5 || values.reason.trim().length > 1000)
  )
    errors.push('reason');
  return errors;
}
function versionHeaders(item: SystemRecord | undefined): Record<string, string> {
  if (!item || !Number.isInteger(item.version) || Number(item.version) < 0)
    throw new Error('Missing record version');
  return { 'If-Match': String(item.version) };
}
export async function executeAccessAction(
  action: AccessAction,
  values: AccessValues,
  item?: SystemRecord,
) {
  if (accessErrors(action, values).length) throw new Error('Invalid access form');
  const options = action.startsWith('create') ? {} : { headers: versionHeaders(item) };
  const id = item?.id ?? '';
  switch (action) {
    case 'createUser':
      return (
        await users.usersControllerCreateV1({
          name: values.name.trim(),
          email: values.email.trim(),
          ...(values.employeeCode.trim() ? { employeeCode: values.employeeCode.trim() } : {}),
          preferredLocale: values.preferredLocale,
          roleIds: values.roleIds,
          branchIds: values.branchIds,
        })
      ).data;
    case 'createRole':
      return (
        await roles.rolesControllerCreateV1({
          name: values.name.trim(),
          code: values.code,
          grants: values.grants,
        })
      ).data;
    case 'createBranch':
      return (
        await branches.branchesControllerCreateV1({ name: values.name.trim(), code: values.code })
      ).data;
    case 'editUser':
      return (
        await users.usersControllerUpdateStatusV1(
          id,
          { status: values.status, reason: values.reason.trim() },
          options,
        )
      ).data;
    case 'editRole':
      return (await roles.rolesControllerUpdateV1(id, { name: values.name.trim() }, options)).data;
    case 'editBranch':
      return (
        await branches.branchesControllerUpdateV1(
          id,
          { name: values.name.trim(), isActive: values.isActive },
          options,
        )
      ).data;
    case 'replaceRoles':
      return (
        await users.usersControllerReplaceRolesV1(
          id,
          { ids: values.roleIds, reason: values.reason.trim() },
          options,
        )
      ).data;
    case 'replaceBranches':
      return (
        await users.usersControllerReplaceBranchesV1(
          id,
          { ids: values.branchIds, reason: values.reason.trim() },
          options,
        )
      ).data;
    case 'replaceGrants':
      return (await roles.rolesControllerReplaceGrantsV1(id, { grants: values.grants }, options))
        .data;
  }
}
export type ImportAction = 'validate' | 'reconcile' | 'promote' | 'finalize' | 'archive';
export function importActions(item: SystemRecord): ImportAction[] {
  if (item.status === 'FINALIZED') return [];
  if (item.status === 'STAGED') return ['validate'];
  if (!['VALIDATED', 'RECONCILED'].includes(String(item.status))) return [];
  return [
    'validate',
    'reconcile',
    'promote',
    'archive',
    ...(item.status === 'RECONCILED' && item.openIssues === 0 ? ['finalize' as const] : []),
  ];
}
export async function executeImportAction(
  action: ImportAction,
  id: string,
  key: string,
  note: string,
) {
  const options = { headers: { 'Idempotency-Key': key } };
  if (action === 'archive')
    return (await imports.importsControllerArchiveQuarantinedV1(id, { note: note.trim() }, options))
      .data;
  const operation = {
    validate: imports.importsControllerValidateV1,
    reconcile: imports.importsControllerReconcileV1,
    promote: imports.importsControllerPromoteV1,
    finalize: imports.importsControllerFinalizeV1,
  }[action];
  return (await operation(id, options)).data;
}
export function validWorkbook(file: File): boolean {
  return /\.xlsx$/i.test(file.name) && file.size > 0 && file.size <= 25 * 1024 * 1024;
}
export async function stageWorkbook(file: File) {
  if (!validWorkbook(file)) throw new Error('Invalid workbook');
  const body = new FormData();
  body.set('file', file);
  return (await imports.importsControllerStageV1({ body })).data;
}
export async function resolveImportIssue(
  batchId: string,
  issueId: string,
  input: {
    schemaVersion: 'plg-import-correction/v1';
    decision: 'CORRECT' | 'EXCLUDE';
    expectedRowHash: string;
    expectedIssueCode: string;
    expectedIssueVersion: number;
    correction?: Record<string, unknown>;
    note: string;
  },
) {
  return (
    await imports.importsControllerResolveIssueV1(batchId, issueId, {
      ...input,
      note: input.note.trim(),
    })
  ).data;
}
export async function readChannel(signal?: AbortSignal) {
  return (await channel.otpChannelControllerReadV1({ signal: signal ?? null, cache: 'no-store' }))
    .data;
}
export async function readPairingCode(signal?: AbortSignal) {
  return (
    await channel.otpChannelControllerPairingCodeV1({ signal: signal ?? null, cache: 'no-store' })
  ).data;
}
export async function executeChannelAction(
  action: 'connect' | 'disable' | 'reset',
  version: number,
  reason: string,
  key: string,
) {
  const operation = {
    connect: channel.otpChannelControllerConnectV1,
    disable: channel.otpChannelControllerDisableV1,
    reset: channel.otpChannelControllerResetV1,
  }[action];
  return (
    await operation(
      { reason: reason.trim() },
      { headers: { 'If-Match': String(version), 'Idempotency-Key': key } },
    )
  ).data;
}
