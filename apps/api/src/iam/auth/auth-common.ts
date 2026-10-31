import { createHash } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeIdentifier(type: 'EMAIL' | 'PHONE', value: string): string {
  return type === 'EMAIL' ? value.trim().toLowerCase() : value.replace(/[^+\d]/g, '');
}

export function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    messageKey: 'auth.invalidCredentials',
  });
}

export function versionConflict(): ConflictException {
  return new ConflictException({
    code: 'VERSION_CONFLICT',
    messageKey: 'errors.versionConflict',
  });
}

export function invalidResetToken(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'PASSWORD_RESET_INVALID',
    messageKey: 'auth.passwordResetInvalid',
  });
}
