import type { Prisma } from '@prisma/client';

export async function mergeStudentBillingAccounts(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  sourcePersonId: string,
  targetPersonId: string,
): Promise<number> {
  const accounts = await transaction.billingAccount.findMany({
    where: {
      organizationId,
      kind: 'INDIVIDUAL',
      personId: { in: [sourcePersonId, targetPersonId] },
    },
    select: { id: true, personId: true },
  });
  const source = accounts.find(({ personId }) => personId === sourcePersonId);
  if (!source) return 0;

  const target = accounts.find(({ personId }) => personId === targetPersonId);
  if (!target) {
    await transaction.billingAccount.update({
      where: { id: source.id },
      data: { personId: targetPersonId, version: { increment: 1 } },
    });
    return 1;
  }

  const scope = { organizationId, billingAccountId: source.id };
  const destination = { billingAccountId: target.id };
  await transaction.enrollment.updateMany({ where: scope, data: destination });
  await transaction.ledgerEntry.updateMany({ where: scope, data: destination });
  await transaction.payment.updateMany({ where: scope, data: destination });
  await transaction.paymentGatewayAttempt.updateMany({
    where: scope,
    data: destination,
  });
  await transaction.internalInvoice.updateMany({
    where: scope,
    data: destination,
  });
  await transaction.internalReceipt.updateMany({
    where: scope,
    data: destination,
  });
  await transaction.billingAccount.delete({ where: { id: source.id } });
  await transaction.billingAccount.update({
    where: { id: target.id },
    data: { version: { increment: 1 } },
  });
  return 1;
}
