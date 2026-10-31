import { timingSafeEqual } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';

export function requireConnectorToken(
  authorization: string | undefined,
  expectedToken: string | undefined,
): void {
  if (!authorization?.startsWith('Bearer ') || !expectedToken) throw hiddenNotFound();
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw hiddenNotFound();
  }
}

function hiddenNotFound(): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', messageKey: 'errors.notFound' });
}
