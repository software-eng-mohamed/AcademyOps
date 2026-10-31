import { BadRequestException } from '@nestjs/common';
import type { ApproveStudentRegistrationDto } from './student-registration.dto';

const referencePattern = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{9,79}$/;

export function requireRegistrationApprovalProof(proof: ApproveStudentRegistrationDto): string {
  if (
    proof?.verificationMethod !== 'IN_PERSON_EMAIL_OWNERSHIP' ||
    !referencePattern.test(proof.verificationReference)
  ) {
    throw new BadRequestException({
      code: 'REGISTRATION_VERIFICATION_PROOF_REQUIRED',
      messageKey: 'students.registration.verificationProofRequired',
    });
  }
  return proof.verificationReference;
}
