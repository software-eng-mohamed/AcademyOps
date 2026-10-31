import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { requireRegistrationApprovalProof } from '../src/students/student-registration-approval-proof';

describe('student registration approval proof', () => {
  it('accepts only a recorded in-person email-ownership reference', () => {
    expect(
      requireRegistrationApprovalProof({
        verificationMethod: 'IN_PERSON_EMAIL_OWNERSHIP',
        verificationReference: 'AO-PROOF-2026-000123',
      }),
    ).toBe('AO-PROOF-2026-000123');

    expectProofRequired(() =>
      requireRegistrationApprovalProof({
        verificationMethod: 'IN_PERSON_EMAIL_OWNERSHIP',
        verificationReference: 'invalid',
      }),
    );

    expectProofRequired(() =>
      requireRegistrationApprovalProof({
        verificationMethod: 'EMAIL_CHALLENGE' as 'IN_PERSON_EMAIL_OWNERSHIP',
        verificationReference: 'AO-PROOF-2026-000123',
      }),
    );
  });
});

function expectProofRequired(operation: () => unknown): void {
  try {
    operation();
    throw new Error('Expected approval proof rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      code: 'REGISTRATION_VERIFICATION_PROOF_REQUIRED',
      messageKey: 'students.registration.verificationProofRequired',
    });
  }
}
