import { describe, expect, it } from 'vitest';
import { rolesRequireMfa } from '../src/iam/auth/auth-profile.service';

describe('auth profile MFA policy', () => {
  it.each([
    'OWNER',
    'RECEPTION',
    'SALES',
    'ACCOUNTS',
    'ATTENDANCE',
    'ACADEMIC',
    'TRAINER',
    'OPERATIONS',
  ])('requires MFA for the %s staff role', (role) => {
    expect(rolesRequireMfa([role])).toBe(true);
  });

  it('does not require MFA for a student-only account', () => {
    expect(rolesRequireMfa(['STUDENT'])).toBe(false);
  });

  it('requires MFA when a student also has any staff role', () => {
    expect(rolesRequireMfa(['STUDENT', 'ATTENDANCE'])).toBe(true);
  });
});
