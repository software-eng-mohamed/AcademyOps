import { createHmac, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { attendanceFixture } from './attendance-role-http-support';
import type { HttpTestContext } from './http-test-harness';

export const ids = (value: unknown) =>
  z
    .object({ items: z.array(z.object({ id: z.string() })) })
    .parse(value)
    .items.map(({ id }) => id);
export async function fixture(context: HttpTestContext) {
  const f = await attendanceFixture(context, 'STUDENT');
  await context.prisma.user.update({
    where: { id: context.userId },
    data: { personId: f.studentPersonId },
  });
  return f;
}
export async function challenge(context: HttpTestContext, sessionId: string, expired = false) {
  const nonce = randomUUID();
  await context.prisma.qrChallenge.updateMany({
    where: { organizationId: context.organizationId, sessionId, isActive: true },
    data: { isActive: false },
  });
  const value = await context.prisma.qrChallenge.create({
    data: {
      organizationId: context.organizationId,
      sessionId,
      nonceDigest: createHmac(
        'sha256',
        context.app.get(ConfigService).getOrThrow<string>('QR_HMAC_SECRET'),
      )
        .update(nonce)
        .digest('hex'),
      expiresAt: new Date(Date.now() + (expired ? -60000 : 60000)),
      createdBy: context.userId,
      createdAt: new Date(Date.now() - 120000),
    },
  });
  return `${value.id}.${nonce}`;
}
