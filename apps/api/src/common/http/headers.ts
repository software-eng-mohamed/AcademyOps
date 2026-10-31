import { BadRequestException, HttpException } from '@nestjs/common';

// Extracts version integer from If-Match (handles weak ETags like W/"1")
export function requireVersion(ifMatch: string | undefined): number {
  if (!ifMatch) {
    throw new HttpException(
      { code: 'VERSION_REQUIRED', messageKey: 'errors.ifMatchRequired' },
      428,
    );
  }
  const normalized = ifMatch.replace(/^W\//, '').replaceAll('"', '');
  const version = Number(normalized);
  if (!Number.isInteger(version) || version < 1) {
    throw new BadRequestException({ code: 'VERSION_INVALID', messageKey: 'errors.ifMatchInvalid' });
  }
  return version;
}

// Validates idempotency key presence and bounds (8-128 chars)
export function requireIdempotencyKey(value: string | undefined): string {
  if (!value || value.length < 8 || value.length > 128) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      messageKey: 'errors.idempotencyKeyRequired',
    });
  }
  return value;
}
