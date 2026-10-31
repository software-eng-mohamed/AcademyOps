import { describe, expect, it, vi } from 'vitest';
import { mfaAccountLabel, totpEnrollmentUri } from '../src/iam/auth/mfa-enrollment-label';

describe('MFA enrollment account label', () => {
  it('uses the verified login email instead of the internal user UUID', async () => {
    const transaction = {
      userLoginIdentifier: {
        findFirst: vi.fn().mockResolvedValue({ normalizedValue: ' Operator@Example.COM ' }),
      },
      user: { findFirst: vi.fn() },
      person: { findFirst: vi.fn() },
    };
    const label = await mfaAccountLabel(transaction as never, 'organization-id', 'user-id');

    expect(label).toBe('operator@example.com');
    expect(transaction.user.findFirst).not.toHaveBeenCalled();
    expect(totpEnrollmentUri('ABC234', label)).toContain('AcademyOps:operator%40example.com');
    expect(totpEnrollmentUri('ABC234', label)).not.toContain('user-id');
  });

  it('falls back to the public person id when no verified email exists', async () => {
    const transaction = {
      userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn().mockResolvedValue({ personId: 'person-id' }) },
      person: { findFirst: vi.fn().mockResolvedValue({ publicId: 'STAFF-007' }) },
    };

    await expect(mfaAccountLabel(transaction as never, 'organization-id', 'user-id')).resolves.toBe(
      'STAFF-007',
    );
  });
});
