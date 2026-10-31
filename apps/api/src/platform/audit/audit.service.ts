import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../database/prisma.service';
import type { ListAuditEventsDto } from './audit.dto';
export type AuditInput = {
  organizationId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  correlationId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  async list(access: AccessContext, query: ListAuditEventsDto) {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        organizationId: access.organizationId,
        ...(query.action
          ? { action: { contains: query.action, mode: 'insensitive' as const } }
          : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const visible = events.slice(0, query.limit);
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: visible.flatMap(({ actorUserId }) => (actorUserId ? [actorUserId] : [])) },
      },
      select: { id: true, personId: true },
    });
    const people = await this.prisma.person.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: users.map(({ personId }) => personId) },
      },
      select: { id: true, publicId: true, name: true },
    });
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const actors = new Map(users.map((user) => [user.id, peopleById.get(user.personId) ?? null]));
    return {
      items: visible.map((event) => ({
        ...event,
        actor: event.actorUserId ? (actors.get(event.actorUserId) ?? null) : null,
      })),
      nextCursor: events.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
    };
  }
  async read(access: AccessContext, id: string) {
    const event = await this.prisma.auditEvent.findFirst({
      where: { id, organizationId: access.organizationId },
    });
    if (!event) {
      throw new NotFoundException({
        code: 'AUDIT_EVENT_NOT_FOUND',
        messageKey: 'audit.eventNotFound',
      });
    }
    if (!event.actorUserId) return { ...event, actor: null };
    const user = await this.prisma.user.findFirst({
      where: { id: event.actorUserId, organizationId: access.organizationId },
      select: { personId: true },
    });
    const actor = user
      ? await this.prisma.person.findFirst({
          where: { id: user.personId, organizationId: access.organizationId },
          select: { publicId: true, name: true },
        })
      : null;
    return { ...event, actor };
  }
  async write(transaction: Prisma.TransactionClient, input: AuditInput): Promise<void> {
    await transaction.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        correlationId: input.correlationId,
        ...(input.before === undefined ? {} : { before: input.before }),
        ...(input.after === undefined ? {} : { after: input.after }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    });
  }
}
