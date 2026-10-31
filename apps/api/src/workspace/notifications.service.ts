import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import type { ListNotificationsDto } from './workspace.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(access: AccessContext, input: ListNotificationsDto) {
    const items = await this.prisma.userNotification.findMany({
      where: {
        organizationId: access.organizationId,
        userId: access.actorUserId,
        readAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        subjectType: true,
        subjectId: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    });
    const unreadCount = await this.prisma.userNotification.count({
      where: {
        organizationId: access.organizationId,
        userId: access.actorUserId,
        readAt: null,
      },
    });
    const hasMore = items.length > input.limit;
    const page = items.slice(0, input.limit);
    return {
      unreadCount,
      items: page.map((item) => ({
        ...item,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async markRead(access: AccessContext, id: string): Promise<void> {
    const deleted = await this.prisma.userNotification.deleteMany({
      where: {
        id,
        organizationId: access.organizationId,
        userId: access.actorUserId,
      },
    });
    if (deleted.count === 0) throw this.notFound();
  }

  async markAllRead(access: AccessContext): Promise<void> {
    await this.prisma.userNotification.deleteMany({
      where: {
        organizationId: access.organizationId,
        userId: access.actorUserId,
      },
    });
  }

  private notFound() {
    return new NotFoundException({
      code: 'NOTIFICATION_NOT_FOUND',
      messageKey: 'notifications.notFound',
    });
  }
}
