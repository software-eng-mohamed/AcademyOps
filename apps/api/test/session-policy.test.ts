import { describe, expect, it, vi } from 'vitest';
import { issueUserSession, selectLoginSessionPolicy } from '../src/iam/auth/session-cookie.helper';

describe('session policy', () => {
  it('selects a remembered session only when the user opts in', () => {
    expect(selectLoginSessionPolicy(true)).toBe('REMEMBERED');
    expect(selectLoginSessionPolicy(false)).toBe('STANDARD');
    expect(selectLoginSessionPolicy(undefined)).toBe('STANDARD');
  });

  it('persists a bounded 30-day/7-day remembered session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T00:00:00.000Z'));
    const create = vi.fn().mockResolvedValue({});
    const result = await issueUserSession(
      { userSession: { create } } as never,
      'session-pepper-at-least-32-bytes-long',
      {
        organizationId: 'org-a',
        userId: 'user-a',
        mfaVerified: false,
        policy: 'REMEMBERED',
      },
    );

    expect(result.expiresAt.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(result.persistent).toBe(true);
    const createInput = create.mock.calls[0]?.[0] as unknown as {
      data: { idleTimeoutSeconds: number };
    };
    expect(createInput.data.idleTimeoutSeconds).toBe(604_800);
    vi.useRealTimers();
  });
});
