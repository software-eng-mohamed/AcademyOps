import { ForbiddenException } from '@nestjs/common';
import type { AccessContext, AccessScope, PermissionCode } from '@academyops/contracts';

export type DelegatedGrant = { permissionCode: string; scope: string };

function denied(): ForbiddenException {
  return new ForbiddenException({
    code: 'IAM_DELEGATION_DENIED',
    messageKey: 'iam.delegationDenied',
  });
}

export function assertGrantDelegation(
  access: AccessContext,
  grants: readonly DelegatedGrant[],
): void {
  for (const grant of grants) {
    const heldScopes = access.grants.get(grant.permissionCode as PermissionCode);
    if (!heldScopes?.has('O') && !heldScopes?.has(grant.scope as AccessScope)) {
      throw denied();
    }
  }
}

export function assertBranchDelegation(access: AccessContext, branchIds: readonly string[]): void {
  if (access.grants.get('users.manage')?.has('O')) return;
  if (branchIds.some((branchId) => !access.branchIds.has(branchId))) throw denied();
}
