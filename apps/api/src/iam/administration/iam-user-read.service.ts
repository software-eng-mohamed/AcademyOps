import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import type { ListUsersDto } from './iam-administration.dto';
import { notFound } from './iam-administration.utils';
@Injectable()
export class IamUserReadService {
  constructor(private readonly prisma: PrismaService) {}
  async listUsers(access: AccessContext, input: ListUsersDto) {
    let matchingPersonIds: string[] | undefined;
    if (input.search) {
      const people = await this.prisma.person.findMany({
        where: {
          organizationId: access.organizationId,
          OR: [
            { publicId: { contains: input.search, mode: 'insensitive' } },
            { name: { contains: input.search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      const identifiers = await this.prisma.userLoginIdentifier.findMany({
        where: {
          organizationId: access.organizationId,
          normalizedValue: { contains: input.search, mode: 'insensitive' },
          revokedAt: null,
        },
        select: { userId: true },
        take: 200,
      });
      const identifierUsers = await this.prisma.user.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: identifiers.map(({ userId }) => userId) },
        },
        select: { personId: true },
      });
      matchingPersonIds = [
        ...new Set([
          ...people.map(({ id }) => id),
          ...identifierUsers.map(({ personId }) => personId),
        ]),
      ];
    }
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: access.organizationId,
        ...(input.status ? { status: input.status } : {}),
        ...(matchingPersonIds ? { personId: { in: matchingPersonIds } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const visible = users.slice(0, input.limit);
    const items = await Promise.all(
      visible.map((user) => this.buildUserSummary(access.organizationId, user.id)),
    );
    return {
      items,
      nextCursor: users.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
    };
  }
  async readUser(access: AccessContext, id: string) {
    return this.buildUserSummary(access.organizationId, id);
  }
  async buildUserSummary(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw notFound('USER_NOT_FOUND', 'users.notFound');
    const [person, identifiers, roleAssignments, staff] = await Promise.all([
      this.prisma.person.findFirstOrThrow({ where: { id: user.personId, organizationId } }),
      this.prisma.userLoginIdentifier.findMany({
        where: { organizationId, userId: user.id, revokedAt: null },
        select: { type: true, normalizedValue: true, verifiedAt: true },
      }),
      this.prisma.userRoleAssignment.findMany({
        where: { organizationId, userId: user.id, endsAt: null },
        select: { roleId: true, startsAt: true },
      }),
      this.prisma.staffProfile.findFirst({ where: { organizationId, personId: user.personId } }),
    ]);
    const roles = await this.prisma.role.findMany({
      where: { organizationId, id: { in: roleAssignments.map(({ roleId }) => roleId) } },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    const branchAssignments = staff
      ? await this.prisma.staffBranchAssignment.findMany({
          where: { organizationId, staffProfileId: staff.id, endsAt: null },
          select: { branchId: true, startsAt: true },
        })
      : [];
    const branches = await this.prisma.branch.findMany({
      where: { organizationId, id: { in: branchAssignments.map(({ branchId }) => branchId) } },
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: { code: 'asc' },
    });
    return {
      id: user.id,
      publicId: person.publicId,
      name: person.name,
      status: user.status,
      preferredLocale: user.preferredLocale,
      mustChangePassword: user.mustChangePassword,
      version: user.version,
      employeeCode: staff?.employeeCode ?? null,
      identifiers,
      roles,
      branches,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
