import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import type { SearchResult } from './search-contract';
import { SearchResolverService } from './search-resolver.service';
import type { RecordRecentEntityDto, SearchEntityType } from './workspace.dto';

@Injectable()
export class SearchRecentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: SearchResolverService,
  ) {}

  async recent(access: AccessContext): Promise<SearchResult[]> {
    const entries = await this.prisma.userRecentEntity.findMany({
      where: { organizationId: access.organizationId, userId: access.actorUserId },
      orderBy: { lastViewedAt: 'desc' },
      take: 8,
    });
    const resolved = await Promise.all(
      entries.map((entry) =>
        this.resolver.resolve(access, entry.entityType as SearchEntityType, entry.entityId),
      ),
    );
    return resolved.filter((item): item is SearchResult => item !== null);
  }

  async record(access: AccessContext, input: RecordRecentEntityDto): Promise<void> {
    const entity = await this.resolver.resolve(access, input.entityType, input.entityId);
    if (!entity) throw this.notFound();
    await this.prisma.userRecentEntity.upsert({
      where: {
        organizationId_userId_entityType_entityId: {
          organizationId: access.organizationId,
          userId: access.actorUserId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      },
      update: { lastViewedAt: new Date() },
      create: {
        organizationId: access.organizationId,
        userId: access.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  }

  private notFound() {
    return new NotFoundException({
      code: 'SEARCH_ENTITY_NOT_FOUND',
      messageKey: 'search.entityNotFound',
    });
  }
}
