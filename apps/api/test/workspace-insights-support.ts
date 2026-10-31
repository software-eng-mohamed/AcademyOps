import type { Prisma } from '@prisma/client';
import type { AccessContext, AccessScope, PermissionCode } from '@academyops/contracts';
import { CatalogAccessService } from '../src/academic/catalog-access.service';
import { EnrollmentQueryService } from '../src/enrollment/enrollment-query.service';
import { FinanceAccessService } from '../src/finance/finance-access.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { WorkspaceBusinessInsightsService } from '../src/reporting/workspace-business-insights.service';
import { WorkspaceLearningInsightsService } from '../src/reporting/workspace-learning-insights.service';

export function context(
  org: string,
  actor: string,
  scope: AccessScope = 'O',
  branches: string[] = [],
): AccessContext {
  const permissions: PermissionCode[] = [
    'academic.catalog.read',
    'enrollments.read',
    'payments.read',
    'messaging.otp.read',
  ];
  return {
    organizationId: org,
    actorUserId: actor,
    branchIds: new Set(branches),
    assignedResourceIds: new Set(),
    grants: new Map(permissions.map((p) => [p, new Set([scope])])),
  };
}
export function services(tx: Prisma.TransactionClient) {
  const db = tx as PrismaService;
  return {
    learning: new WorkspaceLearningInsightsService(db, new CatalogAccessService(db)),
    business: new WorkspaceBusinessInsightsService(
      db,
      new EnrollmentQueryService(db),
      new FinanceAccessService(),
    ),
  };
}
