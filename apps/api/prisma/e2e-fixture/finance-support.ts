import type { PaymentMethod } from '@prisma/client';
import type { FixtureContext } from './types';
export function dueDate(daysFromNow: number): Date {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + daysFromNow);
  return value;
}
export async function seedPaymentMethods(ctx: FixtureContext): Promise<PaymentMethod> {
  for (const value of [
    { code: 'CASH', ar: 'نقدي', en: 'Cash', verify: false },
    { code: 'PAYMOB', ar: 'باي موب', en: 'Paymob', verify: false },
  ]) {
    await ctx.prisma.paymentMethod.upsert({
      where: {
        organizationId_code: { organizationId: ctx.organization.id, code: value.code },
      },
      update: {
        name: value.en,
        verificationRequired: value.verify,
        isActive: true,
      },
      create: {
        organizationId: ctx.organization.id,
        code: value.code,
        name: value.en,
        verificationRequired: value.verify,
      },
    });
  }
  return ctx.prisma.paymentMethod.findFirstOrThrow({
    where: { organizationId: ctx.organization.id, code: 'CASH' },
  });
}
