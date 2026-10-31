import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { calculateImportMetrics, saveImportMetrics } from '../src/imports/import-reconciliation';
import { asObject, codeFrom, parseMaster } from '../src/imports/import-values';
import type { XlsxScalar } from '../src/imports/xlsx-reader';
import { PrismaService } from '../src/platform/database/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });

const [mode, sourceSha256, outputPath] = process.argv.slice(2);
if (!['dry-run', 'apply'].includes(mode ?? '') || !sourceSha256 || !outputPath) {
  throw new Error(
    'Usage: ts-node reconcile-repaired-legacy-payment-dates.ts <dry-run|apply> <source-sha256> <output.json>',
  );
}

const prisma = new PrismaService();
const methodCode = (value: string) => `LEGACY_${codeFrom(value, 'UNKNOWN')}`.slice(0, 50);
const amountMethodKey = (amount: number, code: string) => `${amount.toFixed(2)}|${code}`;
const cairoDateParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
};
const dateRelation = (parsed: Date, historical: Date): 'same' | 'swapped' | 'different' => {
  const oldLocal = cairoDateParts(historical);
  if (
    parsed.getUTCFullYear() === oldLocal.year &&
    parsed.getUTCMonth() + 1 === oldLocal.month &&
    parsed.getUTCDate() === oldLocal.day
  ) {
    return 'same';
  }
  if (
    parsed.getUTCFullYear() === oldLocal.year &&
    parsed.getUTCMonth() + 1 === oldLocal.day &&
    parsed.getUTCDate() === oldLocal.month
  ) {
    return 'swapped';
  }
  return 'different';
};

function alignedPairs(
  left: Array<{ key: string; date: Date }>,
  right: Array<{ key: string; date: Date }>,
): Array<[number, number]> {
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const relation = dateRelation(left[leftIndex]!.date, right[rightIndex]!.date);
      const matchScore =
        left[leftIndex]!.key === right[rightIndex]!.key
          ? 100 + (relation === 'same' ? 3 : relation === 'swapped' ? 2 : 0)
          : Number.NEGATIVE_INFINITY;
      lengths[leftIndex]![rightIndex] = Math.max(
        matchScore + lengths[leftIndex + 1]![rightIndex + 1]!,
        lengths[leftIndex + 1]![rightIndex]!,
        lengths[leftIndex]![rightIndex + 1]!,
      );
    }
  }
  const pairs: Array<[number, number]> = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const relation = dateRelation(left[leftIndex]!.date, right[rightIndex]!.date);
    const matchScore =
      left[leftIndex]!.key === right[rightIndex]!.key
        ? 100 + (relation === 'same' ? 3 : relation === 'swapped' ? 2 : 0)
        : Number.NEGATIVE_INFINITY;
    if (matchScore + lengths[leftIndex + 1]![rightIndex + 1]! === lengths[leftIndex]![rightIndex]) {
      pairs.push([leftIndex, rightIndex]);
      leftIndex += 1;
      rightIndex += 1;
    } else if (lengths[leftIndex + 1]![rightIndex]! >= lengths[leftIndex]![rightIndex + 1]!) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }
  return pairs;
}

async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'PLG' } });
  const source = await prisma.importSourceFile.findFirstOrThrow({
    where: { organizationId: organization.id, sha256: sourceSha256 },
    orderBy: { createdAt: 'desc' },
  });
  const repaired = await prisma.payment.findMany({
    where: {
      organizationId: organization.id,
      idempotencyKey: { startsWith: 'legacy-payment-repair:' },
      status: 'POSTED',
    },
    select: {
      id: true,
      amount: true,
      methodId: true,
      receivedAt: true,
      postedAt: true,
      ledgerEntryId: true,
      billingAccountId: true,
      enrollmentId: true,
      createdBy: true,
    },
  });
  const repairedIds = repaired.map(({ id }) => id);
  const repairedReferences = await prisma.legacyReference.findMany({
    where: {
      organizationId: organization.id,
      entityType: 'PAYMENT',
      sourceField: 'PAYMENT',
      entityId: { in: repairedIds },
    },
    select: { importRowId: true, entityId: true, rawValue: true },
  });
  const rowIds = [...new Set(repairedReferences.map(({ importRowId }) => importRowId))];
  const importRows = await prisma.importRow.findMany({
    where: { organizationId: organization.id, id: { in: rowIds } },
    select: { id: true, rowNumber: true, rawValues: true },
  });
  const rowById = new Map(importRows.map((row) => [row.id, row]));
  const allReferences = await prisma.legacyReference.findMany({
    where: {
      organizationId: organization.id,
      entityType: 'PAYMENT',
      sourceField: 'PAYMENT',
      importRowId: { in: rowIds },
    },
    select: { importRowId: true, entityId: true, rawValue: true },
  });
  const allPayments = await prisma.payment.findMany({
    where: {
      organizationId: organization.id,
      id: { in: allReferences.map(({ entityId }) => entityId) },
    },
    select: { id: true, amount: true, methodId: true, receivedAt: true },
  });
  const methodCodeById = new Map(
    (
      await prisma.paymentMethod.findMany({
        where: { organizationId: organization.id },
        select: { id: true, code: true },
      })
    ).map(({ id, code }) => [id, code]),
  );
  const byId = new Map(allPayments.map((payment) => [payment.id, payment]));
  const repairedById = new Map(repaired.map((payment) => [payment.id, payment]));
  const repairedIdSet = new Set(repairedIds);
  const originalByExpectedOrdinal = new Map<string, NonNullable<(typeof allPayments)[number]>>();
  for (const importRow of importRows) {
    const expected = parseMaster(
      asObject<Record<string, XlsxScalar>>(importRow.rawValues),
    ).payments;
    const original = allReferences
      .filter(
        (reference) =>
          reference.importRowId === importRow.id && !repairedIdSet.has(reference.entityId),
      )
      .sort((left, right) => Number(left.rawValue) - Number(right.rawValue))
      .map(({ entityId }) => byId.get(entityId))
      .filter((payment): payment is NonNullable<typeof payment> => Boolean(payment));
    const pairs = alignedPairs(
      expected.map((payment) => ({
        key: amountMethodKey(payment.amount, methodCode(payment.method)),
        date: new Date(payment.receivedAt),
      })),
      original.map((payment) => ({
        key: amountMethodKey(
          Number(payment.amount),
          methodCodeById.get(payment.methodId) ?? payment.methodId,
        ),
        date: payment.receivedAt,
      })),
    );
    for (const [expectedIndex, originalIndex] of pairs) {
      const ordinal = expected[expectedIndex]?.sourceOrdinal;
      const payment = original[originalIndex];
      if (ordinal && payment) {
        originalByExpectedOrdinal.set(`${importRow.id}|${ordinal}`, payment);
      }
    }
  }
  const duplicatePairs: Array<{
    importRowId: string;
    rowNumber: number;
    ordinal: string;
    repairedId: string;
    originalId: string;
  }> = [];
  const matchedDatePairs: Array<{
    rowNumber: number;
    ordinal: string;
    repairedAt: string;
    originalAt: string;
  }> = [];
  for (const reference of repairedReferences) {
    const current = repairedById.get(reference.entityId);
    if (!current) continue;
    const original = originalByExpectedOrdinal.get(
      `${reference.importRowId}|${reference.rawValue}`,
    );
    if (original) {
      matchedDatePairs.push({
        rowNumber: rowById.get(reference.importRowId)?.rowNumber ?? 0,
        ordinal: reference.rawValue,
        repairedAt: current.receivedAt.toISOString(),
        originalAt: original.receivedAt.toISOString(),
      });
    }
    if (
      original &&
      ['same', 'swapped'].includes(dateRelation(current.receivedAt, original.receivedAt))
    ) {
      duplicatePairs.push({
        importRowId: reference.importRowId,
        rowNumber: rowById.get(reference.importRowId)?.rowNumber ?? 0,
        ordinal: reference.rawValue,
        repairedId: current.id,
        originalId: original.id,
      });
    }
  }
  const duplicateLedgerIds = duplicatePairs.flatMap((pair) => {
    const ledgerEntryId = repairedById.get(pair.repairedId)?.ledgerEntryId;
    return ledgerEntryId ? [ledgerEntryId] : [];
  });
  const duplicateAllocation = await prisma.ledgerAllocation.aggregate({
    where: {
      organizationId: organization.id,
      creditEntryId: { in: duplicateLedgerIds },
    },
    _count: true,
    _sum: { amount: true },
  });

  if (mode === 'apply') {
    await prisma.$transaction(
      async (transaction) => {
        for (const pair of duplicatePairs) {
          const current = repairedById.get(pair.repairedId)!;
          await transaction.payment.update({
            where: { id: pair.originalId },
            data: { receivedAt: current.receivedAt, postedAt: current.postedAt },
          });
          await transaction.paymentEvent.updateMany({
            where: { organizationId: organization.id, paymentId: pair.originalId },
            data: { occurredAt: current.receivedAt },
          });
          await transaction.legacyReference.updateMany({
            where: { organizationId: organization.id, entityId: pair.repairedId },
            data: { sourceField: 'PAYMENT_REPAIR_REVERSED' },
          });
          if (current.ledgerEntryId) {
            await transaction.ledgerEntry.create({
              data: {
                organizationId: organization.id,
                billingAccountId: current.billingAccountId,
                enrollmentId: current.enrollmentId,
                direction: 'DEBIT',
                entryType: 'PAYMENT_REVERSAL',
                amount: current.amount,
                reversalOfId: current.ledgerEntryId,
                sourceType: 'LEGACY_IMPORT_REPAIR_REVERSAL',
                sourceId: current.id,
                description: 'Reversed duplicate created while correcting legacy date parsing',
              },
            });
          }
          await transaction.payment.update({
            where: { id: pair.repairedId },
            data: { status: 'REVERSED', version: { increment: 1 } },
          });
          await transaction.paymentEvent.create({
            data: {
              organizationId: organization.id,
              paymentId: pair.repairedId,
              fromStatus: 'POSTED',
              toStatus: 'REVERSED',
              reason: 'Duplicate created while correcting legacy date parsing',
              actorUserId: current.createdBy,
            },
          });
        }
      },
      { timeout: 120_000 },
    );
  }

  const metrics =
    mode === 'apply'
      ? await prisma.$transaction(async (transaction) => {
          const calculated = await calculateImportMetrics(
            transaction,
            organization.id,
            source.batchId,
          );
          await saveImportMetrics(transaction, organization.id, source.batchId, calculated);
          return calculated;
        })
      : [];
  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    sourceSha256,
    batchId: source.batchId,
    repairedPayments: repaired.length,
    duplicateDateInterpretations: duplicatePairs.length,
    genuinelyMissingPayments: repaired.length - duplicatePairs.length,
    duplicateAllocationCount: duplicateAllocation._count,
    duplicateAllocatedAmount: Number(duplicateAllocation._sum.amount ?? 0),
    duplicateRows: duplicatePairs.map(({ rowNumber, ordinal }) => ({ rowNumber, ordinal })),
    matchedDatePairs,
    metrics,
  };
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
