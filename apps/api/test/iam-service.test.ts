import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IamAdministrationService } from '../src/iam/administration/iam-administration.service';
import { IamBranchAdministrationService } from '../src/iam/administration/iam-branch-administration.service';
import { IamRoleAdministrationService } from '../src/iam/administration/iam-role-administration.service';
import { IamUserReadService } from '../src/iam/administration/iam-user-read.service';
import { IamUserLifecycleService } from '../src/iam/administration/iam-user-lifecycle.service';
import { IamUserAssignmentService } from '../src/iam/administration/iam-user-assignment.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { AuditService } from '../src/platform/audit/audit.service';
import type { OutboxService } from '../src/platform/outbox/outbox.service';
import type { AccessContext } from '@academyops/contracts';

describe('IamAdministrationService - Owner-only permissions guard', () => {
  const mockPrismaFindFirst = vi.fn();
  const mockPrismaCreate = vi.fn();
  const mockPrismaFindMany = vi.fn();
  const mockPrismaDeleteMany = vi.fn();
  const mockPrismaCreateMany = vi.fn();

  const mockPrisma = {
    role: {
      findFirst: mockPrismaFindFirst,
      create: mockPrismaCreate,
    },
    rolePermissionGrant: {
      findMany: mockPrismaFindMany,
      deleteMany: mockPrismaDeleteMany,
      createMany: mockPrismaCreateMany,
    },
  } as unknown as PrismaService;

  const mockAudit = {} as unknown as AuditService;
  const mockOutbox = {} as unknown as OutboxService;

  const branchAdmin = new IamBranchAdministrationService(mockPrisma, mockAudit, mockOutbox);
  const roleAdmin = new IamRoleAdministrationService(mockPrisma, mockAudit, mockOutbox);
  const userRead = new IamUserReadService(mockPrisma);
  const userLifecycle = new IamUserLifecycleService(mockPrisma, mockAudit, mockOutbox, userRead);
  const userAssignment = new IamUserAssignmentService(mockPrisma, mockAudit, mockOutbox, userRead);

  const service = new IamAdministrationService(
    branchAdmin,
    roleAdmin,
    userRead,
    userLifecycle,
    userAssignment,
  );

  const mockAccessContext: AccessContext = {
    organizationId: 'org-123',
    actorUserId: 'user-123',
    grants: new Map(),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects custom role creation containing students.registration.manage before writes', async () => {
    const inputWithRegistrationManage = {
      code: 'CUSTOM_REGISTRAR',
      name: 'Custom Registrar',
      grants: [
        { permissionCode: 'students.read_basic' as const, scope: 'B' as const },
        { permissionCode: 'students.registration.manage' as const, scope: 'O' as const },
      ],
    };

    let error: unknown;
    try {
      await service.createRole(mockAccessContext, inputWithRegistrationManage, 'correlation-123');
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ConflictException);
    const conflictError = error as ConflictException;
    expect(conflictError.getResponse()).toEqual({
      code: 'OWNER_ONLY_PERMISSIONS',
      messageKey: 'roles.ownerOnlyPermissions',
    });

    expect(mockPrismaFindFirst).not.toHaveBeenCalled();
    expect(mockPrismaCreate).not.toHaveBeenCalled();
  });

  it('rejects custom role grant replacement containing students.registration.manage before writes', async () => {
    const inputWithRegistrationManage = {
      grants: [
        { permissionCode: 'students.read_basic' as const, scope: 'B' as const },
        { permissionCode: 'students.registration.manage' as const, scope: 'O' as const },
      ],
    };

    let error: unknown;
    try {
      await service.replaceRoleGrants(
        mockAccessContext,
        'role-123',
        inputWithRegistrationManage,
        1,
        'correlation-123',
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ConflictException);
    const conflictError = error as ConflictException;
    expect(conflictError.getResponse()).toEqual({
      code: 'OWNER_ONLY_PERMISSIONS',
      messageKey: 'roles.ownerOnlyPermissions',
    });

    expect(mockPrismaFindMany).not.toHaveBeenCalled();
    expect(mockPrismaDeleteMany).not.toHaveBeenCalled();
    expect(mockPrismaCreateMany).not.toHaveBeenCalled();
  });

  it('rejects custom role creation containing finance Owner-only permissions before writes', async () => {
    const inputWithRequestReverse = {
      code: 'CUSTOM_ACCOUNTS',
      name: 'Custom Accounts',
      grants: [
        { permissionCode: 'students.read_basic' as const, scope: 'B' as const },
        { permissionCode: 'payments.reverse.request' as const, scope: 'B' as const },
      ],
    };

    let error: unknown;
    try {
      await service.createRole(mockAccessContext, inputWithRequestReverse, 'correlation-123');
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ConflictException);
    const conflictError = error as ConflictException;
    expect(conflictError.getResponse()).toEqual({
      code: 'OWNER_ONLY_PERMISSIONS',
      messageKey: 'roles.ownerOnlyPermissions',
    });

    expect(mockPrismaFindFirst).not.toHaveBeenCalled();
    expect(mockPrismaCreate).not.toHaveBeenCalled();
  });
});
