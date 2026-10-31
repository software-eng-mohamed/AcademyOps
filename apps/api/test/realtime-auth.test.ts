import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserSession } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeAuthService } from '../src/realtime/realtime-auth.service';
import type { RealtimeConnectionLeaseService } from '../src/realtime/realtime-connection-lease.service';
import { SessionAccessService } from '../src/iam/authorization/session-access.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { RealtimeTicketService } from '../src/realtime/realtime-ticket.service';

const origin = 'https://academy.example.com';

describe('realtime authentication', () => {
  it('rejects a non-exact origin before session lookup', async () => {
    const sessions = { authenticateRealtime: vi.fn() };
    const service = new RealtimeAuthService(
      new ConfigService({ WEB_ORIGIN: origin }),
      sessions as unknown as SessionAccessService,
      {} as RealtimeTicketService,
      {} as RealtimeConnectionLeaseService,
    );

    await expect(
      service.authenticate('https://evil.example.com', 'plg_session=secret'),
    ).rejects.toThrow('ORIGIN_INVALID');
    expect(sessions.authenticateRealtime).not.toHaveBeenCalled();
  });

  it('requires a one-time ticket and never falls back to the session cookie', async () => {
    const sessions = {
      authenticateRealtime: vi.fn(),
      revalidateRealtime: vi.fn(),
    };
    const service = new RealtimeAuthService(
      new ConfigService({ WEB_ORIGIN: origin }),
      sessions as unknown as SessionAccessService,
      {} as RealtimeTicketService,
      {} as RealtimeConnectionLeaseService,
    );

    await expect(service.authenticate(origin, 'plg_session=raw-token')).rejects.toThrow(
      'TICKET_REQUIRED',
    );
    expect(sessions.authenticateRealtime).not.toHaveBeenCalled();
    expect(sessions.revalidateRealtime).not.toHaveBeenCalled();
  });

  it.each([
    { revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date() },
    { revokedAt: null, expiresAt: new Date(Date.now() - 1), lastSeenAt: new Date() },
    {
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(Date.now() - 31 * 60_000),
    },
  ])('rejects revoked, expired, or idle sessions', async (state) => {
    const session = sessionFixture(state);
    const prisma = {
      userSession: { findUnique: vi.fn().mockResolvedValue(session) },
    } as unknown as PrismaService;
    const service = new SessionAccessService(
      prisma,
      new ConfigService({ SESSION_PEPPER: 'x'.repeat(32) }),
    );

    await expect(service.authenticateRealtime('raw-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refreshes active session activity at a bounded interval', async () => {
    const session = sessionFixture({ lastSeenAt: new Date(Date.now() - 6 * 60_000) });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      userSession: { findUnique: vi.fn().mockResolvedValue(session), updateMany },
    } as unknown as PrismaService;
    const service = new SessionAccessService(
      prisma,
      new ConfigService({ SESSION_PEPPER: 'x'.repeat(32) }),
    );

    await expect(service.authenticateHttpSession('raw-token')).resolves.toMatchObject({
      id: session.id,
    });
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it('uses the persisted idle policy for an opted-in student session', async () => {
    const session = sessionFixture({
      idleTimeoutSeconds: 7 * 24 * 60 * 60,
      lastSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000),
      expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1_000),
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      userSession: { findUnique: vi.fn().mockResolvedValue(session), updateMany },
    } as unknown as PrismaService;
    const service = new SessionAccessService(
      prisma,
      new ConfigService({ SESSION_PEPPER: 'x'.repeat(32) }),
    );

    await expect(service.authenticateHttpSession('raw-token')).resolves.toMatchObject({
      id: session.id,
    });
  });

  it('rejects a session whose user is no longer active', async () => {
    const prisma = {
      userSession: { findUnique: vi.fn().mockResolvedValue(sessionFixture()) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-id',
          organizationId: 'org-id',
          personId: 'person-id',
          status: 'SUSPENDED',
          mustChangePassword: false,
        }),
      },
    } as unknown as PrismaService;
    const service = new SessionAccessService(
      prisma,
      new ConfigService({ SESSION_PEPPER: 'x'.repeat(32) }),
    );

    await expect(service.authenticateRealtime('raw-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an HTTP session whose user is suspended or crosses tenant boundaries', async () => {
    const session = sessionFixture();
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'user-id',
            organizationId: 'org-id',
            personId: 'person-id',
            status: 'SUSPENDED',
            mustChangePassword: false,
          })
          .mockResolvedValueOnce({
            id: 'user-id',
            organizationId: 'other-org',
            personId: 'person-id',
            status: 'ACTIVE',
            mustChangePassword: false,
          }),
      },
    } as unknown as PrismaService;
    const service = new SessionAccessService(
      prisma,
      new ConfigService({ SESSION_PEPPER: 'x'.repeat(32) }),
    );

    await expect(service.buildHttpAccessContext(session)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.buildHttpAccessContext(session)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not grant the staff realtime room through an inactive staff profile', async () => {
    const staffCount = vi.fn().mockResolvedValue(0);
    const prisma = {
      userSession: { findUnique: vi.fn().mockResolvedValue(sessionFixture()) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-id',
          organizationId: 'org-id',
          personId: 'person-id',
          status: 'ACTIVE',
          mustChangePassword: false,
        }),
      },
      userRoleAssignment: { findMany: vi.fn().mockResolvedValue([{ roleId: 'student-role' }]) },
      role: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([{ code: 'STUDENT' }]),
      },
      rolePermissionGrant: {
        findMany: vi.fn().mockResolvedValue([{ permissionCode: 'enrollments.read', scope: 'S' }]),
      },
      staffProfile: { findUnique: vi.fn().mockResolvedValue(null), count: staffCount },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      enrollment: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as PrismaService;
    const service = new SessionAccessService(
      prisma,
      new ConfigService({ SESSION_PEPPER: 'x'.repeat(32) }),
    );

    await expect(service.authenticateRealtime('raw-token')).resolves.toMatchObject({
      isStaff: false,
      isStudent: true,
    });
    expect(staffCount).toHaveBeenCalledWith({
      where: { organizationId: 'org-id', personId: 'person-id', isActive: true },
    });
  });
});

function sessionFixture(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: 'session-id',
    organizationId: 'org-id',
    userId: 'user-id',
    tokenHash: 'hash',
    csrfSecretHash: 'csrf',
    ipHash: null,
    userAgentHash: null,
    mfaVerifiedAt: null,
    lastSeenAt: new Date(),
    idleTimeoutSeconds: 1800,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}
