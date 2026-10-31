import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { calculateImportMetrics, saveImportMetrics } from '../src/imports/import-reconciliation';
import { asObject, codeFrom, parseMaster, type PaymentValue } from '../src/imports/import-values';
import type { XlsxScalar } from '../src/imports/xlsx-reader';
import { PrismaService } from '../src/platform/database/prisma.service';
config({ path: resolve(__dirname, '../../../.env') });
const [sourceSha256, outputPath] = process.argv.slice(2);
if (!sourceSha256 || !outputPath) {
  throw new Error('Usage: ts-node repair-valid-legacy-payments.ts <source-sha256> <output.json>');
}
const prisma = new PrismaService();
const paymentMethodCode = (raw: string) => `LEGACY_${codeFrom(raw, 'UNKNOWN')}`.slice(0, 50);
const paymentSignature = (value: {
  amount: number;
  methodCode: string;
  receivedAt: string | Date;
}) => `${value.amount.toFixed(2)}|${value.methodCode}|${new Date(value.receivedAt).toISOString()}`;
async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'PLG' } });
  const source = await prisma.importSourceFile.findFirstOrThrow({
    where: { organizationId: organization.id, sha256: sourceSha256 },
    orderBy: { createdAt: 'desc' },
  });
  const actor = await prisma.userLoginIdentifier.findFirstOrThrow({
    where: {
      organizationId: organization.id,
      type: 'EMAIL',
      normalizedValue: 'owner@plg.local',
      revokedAt: null,
    },
    select: { userId: true },
  });
  const rows = await prisma.importRow.findMany({
    where: {
      organizationId: organization.id,
      sourceFileId: source.id,
      sheetName: 'Master Sheet',
      disposition: 'IMPORTED',
    },
    select: {
      id: true,
      rowNumber: true,
      rowHash: true,
      rawValues: true,
      targetId: true,
    },
    orderBy: { rowNumber: 'asc' },
  });
  const references = await prisma.legacyReference.findMany({
    where: {
      organizationId: organization.id,
      importRowId: { in: rows.map(({ id }) => id) },
      entityType: 'PAYMENT',
      sourceField: 'PAYMENT',
    },
    select: { importRowId: true, entityId: true },
  });
  const payments = await prisma.payment.findMany({
    where: {
      organizationId: organization.id,
      id: { in: references.map(({ entityId }) => entityId) },
    },
    select: { id: true, amount: true, methodId: true, receivedAt: true, status: true },
  });
  const methods = await prisma.paymentMethod.findMany({
    where: { organizationId: organization.id },
    select: { id: true, code: true },
  });
  const methodCodeById = new Map(methods.map(({ id, code }) => [id, code]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const referenceIdsByRow = new Map<string, string[]>();
  for (const reference of references) {
    const ids = referenceIdsByRow.get(reference.importRowId) ?? [];
    ids.push(reference.entityId);
    referenceIdsByRow.set(reference.importRowId, ids);
  }
  const missing: Array<{
    importRowId: string;
    rowNumber: number;
    rowHash: string;
    enrollmentId: string;
    payment: PaymentValue;
  }> = [];
  let expectedValidPayments = 0;
  for (const row of rows) {
    if (!row.targetId) throw new Error(`Imported Master row ${row.rowNumber} has no target`);
    const expected = parseMaster(asObject<Record<string, XlsxScalar>>(row.rawValues)).payments;
    expectedValidPayments += expected.length;
    const existing = (referenceIdsByRow.get(row.id) ?? [])
      .map((id) => paymentById.get(id))
      .filter(
        (payment): payment is NonNullable<typeof payment> =>
          Boolean(payment) && payment?.status === 'POSTED',
      );
    const consumed = new Set<string>();
    for (const payment of expected) {
      const signature = paymentSignature({
        amount: payment.amount,
        methodCode: paymentMethodCode(payment.method),
        receivedAt: payment.receivedAt,
      });
      const match = existing.find(
        (candidate) =>
          !consumed.has(candidate.id) &&
          paymentSignature({
            amount: Number(candidate.amount),
            methodCode: methodCodeById.get(candidate.methodId) ?? candidate.methodId,
            receivedAt: candidate.receivedAt,
          }) === signature,
      );
      if (match) consumed.add(match.id);
      else
        missing.push({
          importRowId: row.id,
          rowNumber: row.rowNumber,
          rowHash: row.rowHash,
          enrollmentId: row.targetId,
          payment,
        });
    }
  }
  const createdRows: Array<{
    rowNumber: number;
    ordinal: number;
    amount: number;
  }> = [];
  await prisma.$transaction(
    async (transaction) => {
      for (const entry of missing) {
        const ordinal = entry.payment.sourceOrdinal;
        if (!ordinal)
          throw new Error(`Master row ${entry.rowNumber} payment has no source ordinal`);
        const debit = await transaction.ledgerEntry.findFirstOrThrow({
          where: {
            organizationId: organization.id,
            enrollmentId: entry.enrollmentId,
            direction: 'DEBIT',
            sourceType: 'LEGACY_IMPORT_CHARGE',
          },
          select: { id: true, billingAccountId: true, amount: true },
        });
        const methodCode = paymentMethodCode(entry.payment.method);
        const method = await transaction.paymentMethod.upsert({
          where: {
            organizationId_code: { organizationId: organization.id, code: methodCode },
          },
          update: {},
          create: {
            organizationId: organization.id,
            code: methodCode,
            name: entry.payment.method,
            verificationRequired: false,
          },
        });
        const idempotencyKey =
          `legacy-payment-repair:${entry.rowHash.slice(0, 24)}:${ordinal}`.slice(0, 128);
        let payment = await transaction.payment.findFirst({
          where: { organizationId: organization.id, idempotencyKey },
        });
        if (!payment) {
          const paymentId = randomUUID();
          const credit = await transaction.ledgerEntry.create({
            data: {
              organizationId: organization.id,
              billingAccountId: debit.billingAccountId,
              enrollmentId: entry.enrollmentId,
              direction: 'CREDIT',
              entryType: 'PAYMENT',
              amount: entry.payment.amount,
              sourceType: 'LEGACY_IMPORT_PAYMENT',
              sourceId: paymentId,
              description: `Imported ${entry.payment.method}`,
            },
          });
          payment = await transaction.payment.create({
            data: {
              id: paymentId,
              organizationId: organization.id,
              billingAccountId: debit.billingAccountId,
              enrollmentId: entry.enrollmentId,
              ledgerEntryId: credit.id,
              methodId: method.id,
              status: 'POSTED',
              amount: entry.payment.amount,
              externalReference: `LEGACY-REPAIR-${entry.rowHash.slice(0, 12)}-${ordinal}`,
              idempotencyKey,
              receivedAt: new Date(entry.payment.receivedAt),
              postedAt: new Date(entry.payment.receivedAt),
              createdBy: actor.userId,
            },
          });
          await transaction.paymentEvent.create({
            data: {
              organizationId: organization.id,
              paymentId: payment.id,
              toStatus: 'POSTED',
              reason: 'Recovered from verified legacy workbook date parsing',
              actorUserId: actor.userId,
              occurredAt: new Date(entry.payment.receivedAt),
            },
          });
          const allocated = Number(
            (
              await transaction.ledgerAllocation.aggregate({
                where: { organizationId: organization.id, debitEntryId: debit.id },
                _sum: { amount: true },
              })
            )._sum.amount ?? 0,
          );
          const allocation = Math.min(
            entry.payment.amount,
            Math.max(0, Number(debit.amount) - allocated),
          );
          if (allocation > 0) {
            await transaction.ledgerAllocation.create({
              data: {
                organizationId: organization.id,
                creditEntryId: credit.id,
                debitEntryId: debit.id,
                amount: allocation,
                createdBy: actor.userId,
              },
            });
          }
          createdRows.push({ rowNumber: entry.rowNumber, ordinal, amount: entry.payment.amount });
        }
        const referenceWhere = {
          organizationId: organization.id,
          importRowId: entry.importRowId,
          entityType: 'PAYMENT',
          entityId: payment.id,
          sourceField: 'PAYMENT',
          rawValue: `${ordinal}`,
        };
        if (!(await transaction.legacyReference.findFirst({ where: referenceWhere }))) {
          await transaction.legacyReference.create({ data: referenceWhere });
        }
      }
    },
    { timeout: 120000 },
  );
  const metrics = await prisma.$transaction(async (transaction) => {
    const calculated = await calculateImportMetrics(transaction, organization.id, source.batchId);
    await saveImportMetrics(transaction, organization.id, source.batchId, calculated);
    return calculated;
  });
  const report = {
    generatedAt: new Date().toISOString(),
    sourceSha256,
    batchId: source.batchId,
    expectedValidPayments,
    referencedPaymentsBefore: references.length,
    missingValidPayments: missing.length,
    createdPayments: createdRows.length,
    createdAmount: createdRows.reduce((sum, row) => Math.round((sum + row.amount) * 100) / 100, 0),
    createdRows,
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
