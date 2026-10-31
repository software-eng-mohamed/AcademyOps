import { Injectable } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { searchResult, type SearchResult } from './search-contract';
import { SearchScopeService } from './search-scope.service';
import type { SearchEntityType } from './workspace.dto';
@Injectable()
export class SearchDirectoryQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: SearchScopeService,
  ) {}
  async search(
    access: AccessContext,
    type: SearchEntityType,
    query: string,
    limit: number,
    permission: PermissionCode,
    branchIds: string[] | null,
  ): Promise<SearchResult[]> {
    if (type === 'LEAD') return this.leads(access, query, limit, permission, branchIds);
    if (type === 'STUDENT') return this.students(access, query, limit, permission);
    if (type === 'BUSINESS_ACCOUNT') return this.accounts(access, query, limit, branchIds);
    if (type === 'COHORT') return this.cohorts(access, query, limit, branchIds);
    return this.sessions(access, query, limit, branchIds);
  }
  private async leads(
    access: AccessContext,
    query: string,
    limit: number,
    permission: PermissionCode,
    branchIds: string[] | null,
  ) {
    const leads = await this.prisma.lead.findMany({
      where: {
        organizationId: access.organizationId,
        ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
        ...(access.grants.get(permission)?.has('A') && branchIds?.length === 0
          ? { assignedUserId: access.actorUserId }
          : {}),
        OR: [
          { source: { contains: query, mode: 'insensitive' } },
          {
            personId: {
              in: await this.scope.personIdsByName(access.organizationId, query),
            },
          },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    const people = await this.scope.people(
      access.organizationId,
      leads.flatMap(({ personId }) => (personId ? [personId] : [])),
    );
    return leads.map((lead) => {
      const person = lead.personId ? people.get(lead.personId) : undefined;
      return searchResult(
        'LEAD',
        lead.id,
        person?.name ?? lead.source ?? 'Lead',
        person?.name ?? lead.source ?? 'Lead',
        lead.source,
        lead.state,
      );
    });
  }
  private async students(
    access: AccessContext,
    query: string,
    limit: number,
    permission: PermissionCode,
  ) {
    const visiblePersonIds = await this.scope.studentPersonIds(access, permission);
    const profiles = await this.prisma.studentProfile.findMany({
      where: { organizationId: access.organizationId },
      select: { personId: true, portalStatus: true },
    });
    const statusByPerson = new Map(
      profiles.map((profile) => [profile.personId, profile.portalStatus]),
    );
    const people = await this.prisma.person.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: visiblePersonIds ?? profiles.map(({ personId }) => personId) },
        OR: [
          { publicId: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return people.map((person) =>
      searchResult(
        'STUDENT',
        person.id,
        person.name ?? person.publicId,
        person.name ?? person.publicId,
        person.publicId,
        statusByPerson.get(person.id) ?? null,
      ),
    );
  }
  private async accounts(
    access: AccessContext,
    query: string,
    limit: number,
    branchIds: string[] | null,
  ) {
    const accounts = await this.prisma.businessAccount.findMany({
      where: {
        organizationId: access.organizationId,
        ...(branchIds === null ? {} : { owningBranchId: { in: branchIds } }),
        OR: [
          { legalName: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
          { registrationNo: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
    });
    return accounts.map((account) =>
      searchResult(
        'BUSINESS_ACCOUNT',
        account.id,
        account.displayName,
        account.displayName,
        account.registrationNo,
        account.status,
      ),
    );
  }
  private async cohorts(
    access: AccessContext,
    query: string,
    limit: number,
    branchIds: string[] | null,
  ) {
    const cohorts = await this.prisma.cohort.findMany({
      where: {
        organizationId: access.organizationId,
        ...(branchIds === null ? {} : { owningBranchId: { in: branchIds } }),
        OR: [
          { code: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
    });
    return cohorts.map((cohort) =>
      searchResult(
        'COHORT',
        cohort.id,
        cohort.name ?? cohort.code,
        cohort.name ?? cohort.code,
        cohort.code,
        cohort.status,
      ),
    );
  }
  private async sessions(
    access: AccessContext,
    query: string,
    limit: number,
    branchIds: string[] | null,
  ) {
    const cohorts = await this.prisma.cohort.findMany({
      where: {
        organizationId: access.organizationId,
        ...(branchIds === null ? {} : { owningBranchId: { in: branchIds } }),
        OR: [
          { code: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, code: true, name: true },
    });
    const sessions = await this.prisma.session.findMany({
      where: {
        organizationId: access.organizationId,
        cohortId: { in: cohorts.map(({ id }) => id) },
      },
      take: limit,
      orderBy: { startsAt: 'desc' },
    });
    const cohortById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));
    return sessions.map((session) => {
      const cohort = cohortById.get(session.cohortId);
      const label = `${cohort?.name ?? cohort?.code ?? 'Session'} · ${session.ordinal}`;
      return searchResult(
        'SESSION',
        session.id,
        label,
        label,
        session.startsAt?.toISOString() ?? null,
        session.status,
      );
    });
  }
}
