import { ConflictException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { OWNER_ONLY_PERMISSIONS, REGISTRATION_OWNER_ONLY_PERMISSIONS } from '@academyops/contracts';
import { assertGrantDelegation } from './iam-delegation-policy';

export interface PermissionGrantLike {
  permissionCode: string;
  scope: string;
}

/**
 * Validates that the input grants do not contain any owner-only permissions
 * and returns a unique/de-duplicated array of grants.
 */
export function validateAndDeDuplicateGrants<T extends PermissionGrantLike>(
  grants: T[],
  access?: AccessContext,
): T[] {
  const hasOwnerOnly = grants.some(
    (g) =>
      (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(g.permissionCode) ||
      (REGISTRATION_OWNER_ONLY_PERMISSIONS as readonly string[]).includes(g.permissionCode),
  );
  if (hasOwnerOnly) {
    throw new ConflictException({
      code: 'OWNER_ONLY_PERMISSIONS',
      messageKey: 'roles.ownerOnlyPermissions',
    });
  }

  if (access) assertGrantDelegation(access, grants);

  return [
    ...new Map(grants.map((grant) => [`${grant.permissionCode}:${grant.scope}`, grant])).values(),
  ];
}
