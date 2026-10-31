import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import { assigneeNotFound, notFound } from './leads.errors';
import { leadScope } from './lead-scope';
type Transaction = Prisma.TransactionClient;
@Injectable()
export class LeadAccessService {
  constructor(private readonly prisma: PrismaService) {}
  scopeWhere(access: AccessContext, permission: PermissionCode): Prisma.LeadWhereInput {
    return leadScope(access, permission).where;
  }
  scopeSql(access: AccessContext, permission: PermissionCode): Prisma.Sql {
    return leadScope(access, permission).sql;
  }
  assertLeadScope(
    access: AccessContext,
    lead: {
      id: string;
      branchId: string;
      assignedUserId: string | null;
    },
    permission: PermissionCode,
  ) {
    const scopes = access.grants.get(permission);
    if (
      scopes?.has('O') ||
      (scopes?.has('B') && access.branchIds.has(lead.branchId)) ||
      (scopes?.has('A') &&
        (lead.assignedUserId === access.actorUserId || access.assignedResourceIds.has(lead.id)))
    )
      return;
    throw notFound();
  }
  assertBranchScope(access: AccessContext, branchId: string, permission: PermissionCode) {
    const scopes = access.grants.get(permission);
    if (
      scopes?.has('O') ||
      ((scopes?.has('B') || scopes?.has('A')) && access.branchIds.has(branchId))
    )
      return;
    throw notFound();
  }
  assertStageManagement(access: AccessContext) {
    if (access.grants.get('leads.assign')?.has('O')) return;
    throw new ForbiddenException({
      code: 'LEAD_STAGE_MANAGEMENT_FORBIDDEN',
      messageKey: 'leads.stageManagementForbidden',
    });
  }
  async validateAssignee(
    transaction: Transaction,
    organizationId: string,
    branchId: string,
    userId: string,
  ) {
    const user = await transaction.user.findFirst({
      where: { organizationId, id: userId, status: 'ACTIVE' },
      select: { personId: true },
    });
    if (!user) throw assigneeNotFound();
    const staff = await transaction.staffProfile.findFirst({
      where: { organizationId, personId: user.personId, isActive: true },
      select: { id: true },
    });
    if (!staff) throw assigneeNotFound();
    const assignment = await transaction.staffBranchAssignment.findFirst({
      where: {
        organizationId,
        staffProfileId: staff.id,
        branchId,
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
    });
    if (!assignment) throw assigneeNotFound();
  }
  async listAssignees(
    access: AccessContext,
    branchId: string,
    search: string | undefined,
    limit: number,
  ) {
    this.assertBranchScope(access, branchId, 'leads.assign');
    const now = new Date();
    const assignments = await this.prisma.staffBranchAssignment.findMany({
      where: {
        organizationId: access.organizationId,
        branchId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { staffProfileId: true },
    });
    const staff = await this.prisma.staffProfile.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: assignments.map(({ staffProfileId }) => staffProfileId) },
        isActive: true,
      },
      select: { personId: true, employeeCode: true },
    });
    const people = await this.prisma.person.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: staff.map(({ personId }) => personId) },
        ...(search
          ? {
              OR: [
                { publicId: { contains: search, mode: 'insensitive' as const } },
                { name: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, publicId: true, name: true },
    });
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: access.organizationId,
        personId: { in: people.map(({ id }) => id) },
        status: 'ACTIVE',
      },
      select: { id: true, personId: true },
    });
    const staffByPerson = new Map(staff.map((item) => [item.personId, item]));
    const personById = new Map(people.map((item) => [item.id, item]));
    return {
      items: users.flatMap((user) => {
        const person = personById.get(user.personId);
        if (!person) return [];
        return [
          {
            userId: user.id,
            personId: person.id,
            publicId: person.publicId,
            name: person.name,
            employeeCode: staffByPerson.get(person.id)?.employeeCode ?? null,
          },
        ];
      }),
    };
  }
}
