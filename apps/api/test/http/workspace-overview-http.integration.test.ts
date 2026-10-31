import { defaultRoleGrants, workspaceOverviewRoles } from '@academyops/contracts';
import type { WorkspaceOverview } from '@academyops/contracts';
import { describe, expect, it } from 'vitest';
import { SessionAccessService } from '../../src/iam/authorization/session-access.service';
import { get } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';

const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;
databaseDescribe('Role overviews over real authenticated HTTP', () => {
  it('serves all eight roles repeatedly with actual grants, validates parameters and denies no-grant access', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'WORKSPACE_TEST' }, async (context) => {
      const assignment = await context.prisma.userRoleAssignment.findFirstOrThrow({
        where: { userId: context.userId, organizationId: context.organizationId },
      });
      for (const role of workspaceOverviewRoles) {
        await context.prisma.rolePermissionGrant.deleteMany({
          where: { organizationId: context.organizationId, roleId: assignment.roleId },
        });
        await context.prisma.rolePermissionGrant.createMany({
          data: defaultRoleGrants[role].map(([permissionCode, scope]) => ({
            organizationId: context.organizationId,
            roleId: assignment.roleId,
            permissionCode,
            scope,
          })),
        });
        await context.app.get(SessionAccessService).invalidateUserCache(context.userId);
        for (let run = 0; run < 2; run++) {
          const response = await get(context, `dashboard/workspaces/${role}`);
          expect(response.status, `${role}: ${run}`).toBe(200);
          expect(response.headers.get('cache-control')).toContain('no-store');
          const body = (await response.json()) as WorkspaceOverview;
          expect(body.role).toBe(role);
          if (role === 'STUDENT') expect(body).not.toHaveProperty('staff');
          else expect(body.staff?.kind).toBe(role);
          expect(body).not.toHaveProperty('financeHealth');
          if (role !== 'OTP_OPERATOR') expect(body.metrics).toHaveLength(3);
        }
      }
      await context.prisma.rolePermissionGrant.deleteMany({
        where: { organizationId: context.organizationId, roleId: assignment.roleId },
      });
      await context.app.get(SessionAccessService).invalidateUserCache(context.userId);
      for (const role of workspaceOverviewRoles) {
        expect((await get(context, `dashboard/workspaces/${role}`)).status).toBe(403);
      }
      expect((await get(context, 'dashboard/workspaces/OWNER')).status).toBe(400);
      expect((await get(context, 'dashboard/workspaces/NO_GRANT')).status).toBe(400);
      expect(
        (await fetch(`${context.baseUrl}/api/v1/dashboard/workspaces/OPERATIONS`)).status,
      ).toBe(401);
    });
  }, 120_000);
});
