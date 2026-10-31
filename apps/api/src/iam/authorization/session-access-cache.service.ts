import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccessContext, AccessScope, PermissionCode } from '@academyops/contracts';
import IORedis from 'ioredis';

type SerializedAccessContext = {
  organizationId: string;
  actorUserId: string;
  grants: [PermissionCode, AccessScope[]][];
  branchIds: string[];
  assignedResourceIds: string[];
  studentPersonId?: string;
  mfaVerifiedAt?: string;
};

type MemoryEntry = {
  context: AccessContext;
  expiresAt: number;
  userId: string;
  sessionId: string;
};

const defaultTtlSeconds = 45;
const maxMemoryEntries = 2_000;

@Injectable()
export class SessionAccessCacheService implements OnModuleDestroy {
  private readonly redis: IORedis | null = null;
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    if (redisUrl) {
      try {
        this.redis = new IORedis(redisUrl, {
          lazyConnect: true,
          connectTimeout: 1_000,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        });
        this.redis.on('error', () => undefined);
      } catch {
        this.redis = null;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.memory.clear();
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  async get(sessionId: string, mfaState: string): Promise<AccessContext | null> {
    const cacheKey = `iam:ac:${sessionId}:${mfaState}`;
    const now = Date.now();

    const mem = this.memory.get(cacheKey);
    if (mem && mem.expiresAt > now) {
      return mem.context;
    }
    if (mem) {
      this.memory.delete(cacheKey);
    }

    if (!this.redis || this.redis.status !== 'ready') {
      return null;
    }

    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SerializedAccessContext;
      const context = this.deserialize(parsed);
      this.storeMemory(cacheKey, sessionId, parsed.actorUserId, context, defaultTtlSeconds);
      return context;
    } catch {
      return null;
    }
  }

  async set(
    sessionId: string,
    organizationId: string,
    userId: string,
    mfaState: string,
    context: AccessContext,
    ttlSeconds = defaultTtlSeconds,
  ): Promise<void> {
    const cacheKey = `iam:ac:${sessionId}:${mfaState}`;
    this.storeMemory(cacheKey, sessionId, userId, context, ttlSeconds);

    if (!this.redis || this.redis.status !== 'ready') return;

    try {
      const payload: SerializedAccessContext = {
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        grants: Array.from(context.grants.entries()).map(([code, scopes]) => [
          code,
          Array.from(scopes),
        ]),
        branchIds: Array.from(context.branchIds),
        assignedResourceIds: Array.from(context.assignedResourceIds),
        ...(context.studentPersonId !== undefined
          ? { studentPersonId: context.studentPersonId }
          : {}),
        ...(context.mfaVerifiedAt !== undefined ? { mfaVerifiedAt: context.mfaVerifiedAt } : {}),
      };
      await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', ttlSeconds);
      await this.redis.sadd(`iam:user-keys:${userId}`, cacheKey);
      await this.redis.expire(`iam:user-keys:${userId}`, ttlSeconds * 2);
    } catch {
      // Gracefully continue with in-memory caching when Redis is unreachable.
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    for (const [key, entry] of this.memory.entries()) {
      if (entry.sessionId === sessionId) this.memory.delete(key);
    }
    if (this.redis && this.redis.status === 'ready') {
      try {
        const keys = await this.redis.keys(`iam:ac:${sessionId}:*`);
        if (keys.length > 0) await this.redis.del(...keys);
      } catch {
        // Suppress cache invalidation error
      }
    }
  }

  async invalidateUser(userId: string): Promise<void> {
    const sessionIds = new Set<string>();
    for (const [key, entry] of this.memory.entries()) {
      if (entry.userId === userId) {
        sessionIds.add(entry.sessionId);
        this.memory.delete(key);
      }
    }
    if (this.redis && this.redis.status === 'ready') {
      try {
        const userKeys = await this.redis.smembers(`iam:user-keys:${userId}`);
        if (userKeys.length > 0) {
          await this.redis.del(...userKeys, `iam:user-keys:${userId}`);
        }
        for (const sid of sessionIds) {
          const keys = await this.redis.keys(`iam:ac:${sid}:*`);
          if (keys.length > 0) await this.redis.del(...keys);
        }
      } catch {
        // Suppress cache invalidation error
      }
    }
  }

  private storeMemory(
    key: string,
    sessionId: string,
    userId: string,
    context: AccessContext,
    ttlSeconds: number,
  ): void {
    if (this.memory.size >= maxMemoryEntries) {
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey) this.memory.delete(oldestKey);
    }
    this.memory.set(key, {
      context,
      expiresAt: Date.now() + ttlSeconds * 1_000,
      sessionId,
      userId,
    });
  }

  private deserialize(data: SerializedAccessContext): AccessContext {
    const grantMap = new Map<PermissionCode, Set<AccessScope>>();
    for (const [code, scopes] of data.grants) {
      grantMap.set(code, new Set(scopes));
    }
    return {
      organizationId: data.organizationId,
      actorUserId: data.actorUserId,
      grants: grantMap,
      branchIds: new Set(data.branchIds),
      assignedResourceIds: new Set(data.assignedResourceIds),
      ...(data.studentPersonId !== undefined ? { studentPersonId: data.studentPersonId } : {}),
      ...(data.mfaVerifiedAt !== undefined ? { mfaVerifiedAt: data.mfaVerifiedAt } : {}),
    };
  }
}
