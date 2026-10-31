import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export function invalidMfaCode(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'MFA_CODE_INVALID',
    messageKey: 'auth.mfaCodeInvalid',
  });
}

export function freshMfaRequired(): ForbiddenException {
  return new ForbiddenException({
    code: 'MFA_STEP_UP_REQUIRED',
    messageKey: 'auth.mfaStepUpRequired',
  });
}
