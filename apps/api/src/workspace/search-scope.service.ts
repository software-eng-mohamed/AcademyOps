import { Injectable } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import type { SearchEntityType } from './workspace.dto';
const permissionByType: Record<SearchEntityType, PermissionCode> = {
  STUDENT: 'students.read_basic',
  LEAD: 'leads.read',
  PAYMENT: 'payments.read',
  INVOICE: 'invoices.read',
  RECEIPT: 'receipts.read',
  COHORT: 'academic.catalog.read',
  SESSION: 'academic.catalog.read',
  CERTIFICATE: 'certificates.read',
  BUSINESS_ACCOUNT: 'business_accounts.read',
};
@Injectable()
export class SearchScopeService {
  constructor(private readonly prisma: PrismaService) {}
  permission(type: SearchEntityType): PermissionCode {
    return permissionByType[type];
  }
  branchIds(access: AccessContext, permission: PermissionCode): string[] | null {
    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return null;
    if (scopes?.has('B')) return [...access.branchIds];
    return [];
  }
  async studentPersonIds(
    access: AccessContext,
    permission: PermissionCode,
  ): Promise<string[] | undefined> {
    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return undefined;
    const ids = new Set<string>();
    if (scopes?.has('S') && access.studentPersonId) ids.add(access.studentPersonId);
    if (scopes?.has('B')) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          homeBranchId: { in: [...access.branchIds] },
        },
        select: { studentPersonId: true },
      });
      for (const item of enrollments) ids.add(item.studentPersonId);
    }
    if (scopes?.has('A')) {
      const leads = await this.prisma.lead.findMany({
        where: {
          organizationId: access.organizationId,
          assignedUserId: access.actorUserId,
          personId: { not: null },
        },
        select: { personId: true },
      });
      for (const lead of leads) if (lead.personId) ids.add(lead.personId);
    }
    return [...ids];
  }
  async personIdsByName(organizationId: string, query: string): Promise<string[]> {
    return (
      await this.prisma.person.findMany({
        where: {
          organizationId,
          OR: [
            { publicId: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 50,
      })
    ).map(({ id }) => id);
  }
  async people(organizationId: string, ids: string[]) {
    const items = await this.prisma.person.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(items.map((item) => [item.id, item]));
  }
  async billingIds(organizationId: string, enrollmentIds?: string[]) {
    if (enrollmentIds === undefined) {
      return (
        await this.prisma.billingAccount.findMany({
          where: { organizationId },
          select: { id: true },
        })
      ).map(({ id }) => id);
    }
    return (
      await this.prisma.enrollment.findMany({
        where: { organizationId, id: { in: enrollmentIds } },
        select: { billingAccountId: true },
      })
    ).map(({ billingAccountId }) => billingAccountId);
  }
}
