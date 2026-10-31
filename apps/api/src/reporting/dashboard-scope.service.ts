import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';

@Injectable()
export class DashboardScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async visibleBranchIds(
    access: AccessContext,
    requestedBranchId?: string,
  ): Promise<string[] | null> {
    const scopes = access.grants.get('reports.operations.read');
    const organizationWide = scopes?.has('O') ?? false;
    // This legacy summary aggregates complete locations. Assignment-only staff
    // must use their scoped workspace; membership alone never grants B scope.
    if (!organizationWide && !scopes?.has('B')) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        messageKey: 'auth.permissionDenied',
      });
    }
    if (requestedBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: requestedBranchId, organizationId: access.organizationId, isActive: true },
        select: { id: true },
      });
      if (!branch || (!organizationWide && !access.branchIds.has(branch.id))) throw this.notFound();
      return [branch.id];
    }
    if (organizationWide) return null;
    return [...access.branchIds];
  }

  notFound(): NotFoundException {
    return new NotFoundException({ code: 'DASHBOARD_NOT_FOUND', messageKey: 'dashboard.notFound' });
  }
}
