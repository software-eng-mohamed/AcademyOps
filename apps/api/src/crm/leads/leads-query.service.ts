import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import type { ListLeadsDto } from './leads.dto';
import { LeadAccessService } from './lead-access.service';
import { notFound } from './leads.errors';
@Injectable()
export class LeadsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LeadAccessService,
  ) {}
  async list(access: AccessContext, input: ListLeadsDto) {
    let searchedPersonIds: string[] | undefined;
    if (input.search) {
      searchedPersonIds = (
        await this.prisma.person.findMany({
          where: {
            organizationId: access.organizationId,
            OR: [
              { publicId: { contains: input.search, mode: 'insensitive' } },
              { name: { contains: input.search, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
          take: 200,
        })
      ).map(({ id }) => id);
    }
    const leads = await this.prisma.lead.findMany({
      where: {
        organizationId: access.organizationId,
        ...this.access.scopeWhere(access, 'leads.read'),
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.assignedUserId ? { assignedUserId: input.assignedUserId } : {}),
        ...(input.stageId ? { stageId: input.stageId } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.search
          ? {
              OR: [
                { source: { contains: input.search, mode: 'insensitive' } },
                { personId: { in: searchedPersonIds ?? [] } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const items = await this.hydrate(leads.slice(0, input.limit), false);
    return {
      items,
      nextCursor: leads.length > input.limit ? (leads[input.limit - 1]?.id ?? null) : null,
    };
  }
  async read(access: AccessContext, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        organizationId: access.organizationId,
        ...this.access.scopeWhere(access, 'leads.read'),
      },
    });
    if (!lead) throw notFound();
    return (await this.hydrate([lead], true))[0];
  }
  async hydrate<
    T extends {
      id: string;
      organizationId: string;
      personId: string | null;
      stageId: string | null;
    },
  >(leads: T[], includeHistory: boolean) {
    if (!leads.length) return [];
    const organizationId = leads[0]!.organizationId;
    const [people, contacts, stages, activities, history] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          organizationId,
          id: { in: leads.flatMap(({ personId }) => (personId ? [personId] : [])) },
        },
        select: { id: true, publicId: true, name: true },
      }),
      this.prisma.personContact.findMany({
        where: {
          organizationId,
          personId: { in: leads.flatMap(({ personId }) => (personId ? [personId] : [])) },
        },
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.leadStage.findMany({
        where: {
          organizationId,
          id: { in: leads.flatMap(({ stageId }) => (stageId ? [stageId] : [])) },
        },
      }),
      includeHistory
        ? this.prisma.leadActivity.findMany({
            where: { organizationId, leadId: { in: leads.map(({ id }) => id) } },
            orderBy: { occurredAt: 'desc' },
            take: 200,
          })
        : Promise.resolve([]),
      includeHistory
        ? this.prisma.leadStatusHistory.findMany({
            where: { organizationId, leadId: { in: leads.map(({ id }) => id) } },
            orderBy: { occurredAt: 'desc' },
            take: 200,
          })
        : Promise.resolve([]),
    ]);
    return leads.map((lead) => ({
      ...lead,
      person: people.find(({ id }) => id === lead.personId) ?? null,
      contacts: contacts.filter(({ personId }) => personId === lead.personId),
      stage: stages.find(({ id }) => id === lead.stageId) ?? null,
      ...(includeHistory
        ? {
            activities: activities.filter(({ leadId }) => leadId === lead.id),
            history: history.filter(({ leadId }) => leadId === lead.id),
          }
        : {}),
    }));
  }
}
