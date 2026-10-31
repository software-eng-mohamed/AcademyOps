/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi } from 'vitest';
import { IamAdministrationService } from '../src/iam/administration/iam-administration.service';
import type { IamBranchAdministrationService } from '../src/iam/administration/iam-branch-administration.service';
import type { IamRoleAdministrationService } from '../src/iam/administration/iam-role-administration.service';
import type { IamUserReadService } from '../src/iam/administration/iam-user-read.service';
import type { IamUserLifecycleService } from '../src/iam/administration/iam-user-lifecycle.service';
import type { IamUserAssignmentService } from '../src/iam/administration/iam-user-assignment.service';
import type { AccessContext } from '@academyops/contracts';
describe('IamAdministrationService Decomposition Facade', () => {
  const mockAccessContext: AccessContext = {
    organizationId: 'org-123',
    actorUserId: 'user-123',
    grants: new Map(),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };
  const branchAdmin = {
    listBranches: vi.fn(),
    readBranch: vi.fn(),
    createBranch: vi.fn(),
    updateBranch: vi.fn(),
  } as unknown as IamBranchAdministrationService;
  const roleAdmin = {
    listRoles: vi.fn(),
    readRole: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    replaceRoleGrants: vi.fn(),
  } as unknown as IamRoleAdministrationService;
  const userRead = {
    listUsers: vi.fn(),
    readUser: vi.fn(),
  } as unknown as IamUserReadService;
  const userLifecycle = {
    createUser: vi.fn(),
    updateUserStatus: vi.fn(),
  } as unknown as IamUserLifecycleService;
  const userAssignment = {
    replaceUserRoles: vi.fn(),
    replaceUserBranches: vi.fn(),
  } as unknown as IamUserAssignmentService;
  const facade = new IamAdministrationService(
    branchAdmin,
    roleAdmin,
    userRead,
    userLifecycle,
    userAssignment,
  );
  it('should delegate listBranches', async () => {
    vi.mocked(branchAdmin.listBranches).mockResolvedValue({ items: [], nextCursor: null });
    const input = { limit: 10 };
    const res = await facade.listBranches(mockAccessContext, input);
    expect(branchAdmin.listBranches).toHaveBeenCalledWith(mockAccessContext, input);
    expect(res).toEqual({ items: [], nextCursor: null });
  });
  it('should delegate readBranch', async () => {
    vi.mocked(branchAdmin.readBranch).mockResolvedValue({ id: 'branch-1' } as any);
    const res = await facade.readBranch(mockAccessContext, 'branch-1');
    expect(branchAdmin.readBranch).toHaveBeenCalledWith(mockAccessContext, 'branch-1');
    expect(res).toEqual({ id: 'branch-1' });
  });
  it('should delegate createBranch', async () => {
    const input = { code: 'BR1', name: 'Branch 1' };
    vi.mocked(branchAdmin.createBranch).mockResolvedValue({ id: 'branch-1' } as any);
    const res = await facade.createBranch(mockAccessContext, input, 'corr-1');
    expect(branchAdmin.createBranch).toHaveBeenCalledWith(mockAccessContext, input, 'corr-1');
    expect(res).toEqual({ id: 'branch-1' });
  });
  it('should delegate updateBranch', async () => {
    const input = { name: 'New Name' };
    vi.mocked(branchAdmin.updateBranch).mockResolvedValue({ id: 'branch-1' } as any);
    const res = await facade.updateBranch(mockAccessContext, 'branch-1', input, 2, 'corr-1');
    expect(branchAdmin.updateBranch).toHaveBeenCalledWith(
      mockAccessContext,
      'branch-1',
      input,
      2,
      'corr-1',
    );
    expect(res).toEqual({ id: 'branch-1' });
  });
  it('should delegate listRoles', async () => {
    vi.mocked(roleAdmin.listRoles).mockResolvedValue({ items: [], nextCursor: null });
    const input = { limit: 10 };
    const res = await facade.listRoles(mockAccessContext, input);
    expect(roleAdmin.listRoles).toHaveBeenCalledWith(mockAccessContext, input);
    expect(res).toEqual({ items: [], nextCursor: null });
  });
  it('should delegate readRole', async () => {
    vi.mocked(roleAdmin.readRole).mockResolvedValue({ id: 'role-1' } as any);
    const res = await facade.readRole(mockAccessContext, 'role-1');
    expect(roleAdmin.readRole).toHaveBeenCalledWith(mockAccessContext, 'role-1');
    expect(res).toEqual({ id: 'role-1' });
  });
  it('should delegate createRole', async () => {
    const input = { code: 'ADMIN', name: 'Admin', grants: [] };
    vi.mocked(roleAdmin.createRole).mockResolvedValue({ id: 'role-1' } as any);
    const res = await facade.createRole(mockAccessContext, input, 'corr-1');
    expect(roleAdmin.createRole).toHaveBeenCalledWith(mockAccessContext, input, 'corr-1');
    expect(res).toEqual({ id: 'role-1' });
  });
  it('should delegate updateRole', async () => {
    const input = { name: 'New Admin' };
    vi.mocked(roleAdmin.updateRole).mockResolvedValue({ id: 'role-1' } as any);
    const res = await facade.updateRole(mockAccessContext, 'role-1', input, 1, 'corr-1');
    expect(roleAdmin.updateRole).toHaveBeenCalledWith(
      mockAccessContext,
      'role-1',
      input,
      1,
      'corr-1',
    );
    expect(res).toEqual({ id: 'role-1' });
  });
  it('should delegate replaceRoleGrants', async () => {
    const input = { grants: [] };
    vi.mocked(roleAdmin.replaceRoleGrants).mockResolvedValue({ id: 'role-1' } as any);
    const res = await facade.replaceRoleGrants(mockAccessContext, 'role-1', input, 1, 'corr-1');
    expect(roleAdmin.replaceRoleGrants).toHaveBeenCalledWith(
      mockAccessContext,
      'role-1',
      input,
      1,
      'corr-1',
    );
    expect(res).toEqual({ id: 'role-1' });
  });
  it('should delegate listUsers', async () => {
    vi.mocked(userRead.listUsers).mockResolvedValue({ items: [], nextCursor: null });
    const input = { limit: 10 };
    const res = await facade.listUsers(mockAccessContext, input);
    expect(userRead.listUsers).toHaveBeenCalledWith(mockAccessContext, input);
    expect(res).toEqual({ items: [], nextCursor: null });
  });
  it('should delegate readUser', async () => {
    vi.mocked(userRead.readUser).mockResolvedValue({ id: 'user-1' } as any);
    const res = await facade.readUser(mockAccessContext, 'user-1');
    expect(userRead.readUser).toHaveBeenCalledWith(mockAccessContext, 'user-1');
    expect(res).toEqual({ id: 'user-1' });
  });
  it('should delegate createUser', async () => {
    const input = {
      email: 'a@b.com',
      roleIds: [],
      branchIds: [],
      name: 'User',
    } as any;
    vi.mocked(userLifecycle.createUser).mockResolvedValue({ id: 'user-1' } as any);
    const res = await facade.createUser(mockAccessContext, input, 'corr-1');
    expect(userLifecycle.createUser).toHaveBeenCalledWith(mockAccessContext, input, 'corr-1');
    expect(res).toEqual({ id: 'user-1' });
  });
  it('should delegate updateUserStatus', async () => {
    const input = { status: 'ACTIVE' as const };
    vi.mocked(userLifecycle.updateUserStatus).mockResolvedValue({ id: 'user-1' } as any);
    const res = await facade.updateUserStatus(mockAccessContext, 'user-1', input, 1, 'corr-1');
    expect(userLifecycle.updateUserStatus).toHaveBeenCalledWith(
      mockAccessContext,
      'user-1',
      input,
      1,
      'corr-1',
    );
    expect(res).toEqual({ id: 'user-1' });
  });
  it('should delegate replaceUserRoles', async () => {
    const input = { ids: [] };
    vi.mocked(userAssignment.replaceUserRoles).mockResolvedValue({ id: 'user-1' } as any);
    const res = await facade.replaceUserRoles(mockAccessContext, 'user-1', input, 1, 'corr-1');
    expect(userAssignment.replaceUserRoles).toHaveBeenCalledWith(
      mockAccessContext,
      'user-1',
      input,
      1,
      'corr-1',
    );
    expect(res).toEqual({ id: 'user-1' });
  });
  it('should delegate replaceUserBranches', async () => {
    const input = { ids: [] };
    vi.mocked(userAssignment.replaceUserBranches).mockResolvedValue({ id: 'user-1' } as any);
    const res = await facade.replaceUserBranches(mockAccessContext, 'user-1', input, 1, 'corr-1');
    expect(userAssignment.replaceUserBranches).toHaveBeenCalledWith(
      mockAccessContext,
      'user-1',
      input,
      1,
      'corr-1',
    );
    expect(res).toEqual({ id: 'user-1' });
  });
});
