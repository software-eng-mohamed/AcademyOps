import { createHash, timingSafeEqual } from 'node:crypto';

export function digestPhoneOtp(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizePhoneOtpRecipient(phone: string): string {
  return phone.replace(/[^+\d]/g, '');
}

export function timingSafeDigestCompare(aHex: string, bHex: string): boolean {
  const aBuffer = Buffer.from(aHex, 'hex');
  const bBuffer = Buffer.from(bHex, 'hex');
  if (aBuffer.length !== bBuffer.length || aBuffer.length === 0) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}
