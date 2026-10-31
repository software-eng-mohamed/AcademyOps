import { createHash, randomBytes } from 'node:crypto';

export function generateRecoveryCode(): string {
  return randomBytes(10).toString('hex').toUpperCase().match(/.{4}/g)!.join('-');
}

export function normalizeRecoveryCode(code: string): string {
  return code.replaceAll('-', '').trim().toUpperCase();
}

export function recoveryCodeDigest(code: string, pepper: string): string {
  return createHash('sha256')
    .update(`plg-mfa-recovery:${normalizeRecoveryCode(code)}:${pepper}`)
    .digest('hex');
}
