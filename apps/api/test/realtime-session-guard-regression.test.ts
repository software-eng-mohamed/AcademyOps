import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserSession } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { SessionAccessService } from '../src/iam/authorization/session-access.service';
import { SessionGuard } from '../src/iam/authorization/session.guard';

const origin = 'https://academy.example.com';

describe('SessionGuard extraction regression', () => {
  it('preserves the HTTP session and access-context flow', async () => {
    const session = sessionFixture();
    const access = accessFixture();
    const sessions = {
      authenticateHttpSession: vi.fn().mockResolvedValue(session),
      buildHttpAccessContext: vi.fn().mockResolvedValue(access),
    };
    const request = requestFixture('GET');
    const guard = guardFixture(sessions);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(sessions.authenticateHttpSession).toHaveBeenCalledWith('raw-token');
    expect(sessions.buildHttpAccessContext).toHaveBeenCalledWith(session);
    expect(request.sessionId).toBe('session-a');
    expect(request.accessContext).toBe(access);
  });

  it('still rejects CSRF before building authorization context', async () => {
    const sessions = {
      authenticateHttpSession: vi.fn().mockResolvedValue(sessionFixture()),
      buildHttpAccessContext: vi.fn(),
    };
    const request = requestFixture('POST', { origin: 'https://evil.example.com' });
    const guard = guardFixture(sessions);

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions.buildHttpAccessContext).not.toHaveBeenCalled();
  });
});

function guardFixture(sessions: object): SessionGuard {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
  return new SessionGuard(
    reflector as unknown as Reflector,
    sessions as unknown as SessionAccessService,
    new ConfigService({ WEB_ORIGIN: origin }),
  );
}

function requestFixture(method: string, headers: Record<string, string> = {}) {
  return {
    method,
    cookies: { '__Host-plg_session': 'raw-token' },
    header: (name: string) => headers[name.toLowerCase()],
    accessContext: undefined as AccessContext | undefined,
    sessionId: undefined as string | undefined,
  };
}

function contextFor(request: ReturnType<typeof requestFixture>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function sessionFixture(): UserSession {
  return {
    id: 'session-a',
    organizationId: 'org-a',
    userId: 'user-a',
    tokenHash: 'hash',
    csrfSecretHash: 'csrf-hash',
    ipHash: null,
    userAgentHash: null,
    mfaVerifiedAt: null,
    lastSeenAt: new Date(),
    idleTimeoutSeconds: 1800,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
  };
}

function accessFixture(): AccessContext {
  return {
    organizationId: 'org-a',
    actorUserId: 'user-a',
    grants: new Map(),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };
}
