import { createHmac, timingSafeEqual } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';

export function generateStableQrToken(
  secret: string,
  organizationId: string,
  studentPersonId: string,
): string {
  const payload = `v1:${organizationId}:${studentPersonId}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `STABLE:v1:${organizationId}:${studentPersonId}:${signature}`;
}

export function parseAndVerifyStableQrToken(
  token: string,
  secret: string,
  organizationId: string,
): { studentPersonId: string } {
  const parts = token.split(':');
  if (parts.length !== 5 || parts[0] !== 'STABLE' || parts[1] !== 'v1') {
    throw new ForbiddenException({
      code: 'INVALID_STUDENT_QR_TOKEN',
      message: 'Malformed QR token',
    });
  }

  const tokenOrgId = parts[2];
  const studentPersonId = parts[3];
  const signature = parts[4];

  if (!tokenOrgId || !studentPersonId || !signature) {
    throw new ForbiddenException({
      code: 'INVALID_STUDENT_QR_TOKEN',
      message: 'Malformed QR token',
    });
  }

  if (tokenOrgId !== organizationId) {
    throw new ForbiddenException({
      code: 'INVALID_STUDENT_QR_TOKEN',
      message: 'Token organization mismatch',
    });
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(`v1:${tokenOrgId}:${studentPersonId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(signature);

  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new ForbiddenException({
      code: 'INVALID_STUDENT_QR_TOKEN',
      message: 'Invalid signature',
    });
  }

  return { studentPersonId };
}
