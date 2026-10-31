import { Injectable } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { searchResult, type SearchResult } from './search-contract';
import { SearchScopeService } from './search-scope.service';
import type { SearchEntityType } from './workspace.dto';
@Injectable()
export class SearchDirectoryResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: SearchScopeService,
  ) {}
  async resolve(
    access: AccessContext,
    type: SearchEntityType,
    id: string,
    permission: PermissionCode,
    branchIds: string[] | null,
  ): Promise<SearchResult | null> {
    if (type === 'LEAD') return this.lead(access, id, permission, branchIds);
    if (type === 'STUDENT') return this.student(access, id, permission);
    if (type === 'BUSINESS_ACCOUNT') return this.account(access, id, branchIds);
    if (type === 'COHORT') return this.cohort(access, id, branchIds);
    return this.session(access, id, branchIds);
  }
  private async lead(
    access: AccessContext,
    id: string,
    permission: PermissionCode,
    branchIds: string[] | null,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
        ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
        ...(access.grants.get(permission)?.has('A') && branchIds?.length === 0
          ? { assignedUserId: access.actorUserId }
          : {}),
      },
    });
    if (!lead) return null;
    const people = await this.scope.people(
      access.organizationId,
      lead.personId ? [lead.personId] : [],
    );
    const person = lead.personId ? people.get(lead.personId) : undefined;
    return searchResult(
      'LEAD',
      lead.id,
      person?.name ?? lead.source ?? 'Lead',
      person?.name ?? lead.source ?? 'Lead',
      lead.source,
      lead.state,
    );
  }
  private async student(access: AccessContext, id: string, permission: PermissionCode) {
    const visible = await this.scope.studentPersonIds(access, permission);
    if (visible !== undefined && !visible.includes(id)) return null;
    const [person, profile] = await Promise.all([
      this.prisma.person.findFirst({ where: { id, organizationId: access.organizationId } }),
      this.prisma.studentProfile.findFirst({
        where: { personId: id, organizationId: access.organizationId },
      }),
    ]);
    return person && profile
      ? searchResult(
          'STUDENT',
          person.id,
          person.name ?? person.publicId,
          person.name ?? person.publicId,
          person.publicId,
          profile.portalStatus,
        )
      : null;
  }
  private async account(access: AccessContext, id: string, branchIds: string[] | null) {
    const account = await this.prisma.businessAccount.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
        ...(branchIds === null ? {} : { owningBranchId: { in: branchIds } }),
      },
    });
    return account
      ? searchResult(
          'BUSINESS_ACCOUNT',
          account.id,
          account.displayName,
          account.displayName,
          account.registrationNo,
          account.status,
        )
      : null;
  }
  private async cohort(access: AccessContext, id: string, branchIds: string[] | null) {
    const cohort = await this.prisma.cohort.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
        ...(branchIds === null ? {} : { owningBranchId: { in: branchIds } }),
      },
    });
    return cohort
      ? searchResult(
          'COHORT',
          cohort.id,
          cohort.name ?? cohort.code,
          cohort.name ?? cohort.code,
          cohort.code,
          cohort.status,
        )
      : null;
  }
  private async session(access: AccessContext, id: string, branchIds: string[] | null) {
    const session = await this.prisma.session.findFirst({
      where: { id, organizationId: access.organizationId },
    });
    if (!session) return null;
    const cohort = await this.prisma.cohort.findFirst({
      where: {
        id: session.cohortId,
        organizationId: access.organizationId,
        ...(branchIds === null ? {} : { owningBranchId: { in: branchIds } }),
      },
    });
    if (!cohort) return null;
    const label = `${cohort.name ?? cohort.code} · ${session.ordinal}`;
    return searchResult(
      'SESSION',
      session.id,
      label,
      label,
      session.startsAt?.toISOString() ?? null,
      session.status,
    );
  }
}
