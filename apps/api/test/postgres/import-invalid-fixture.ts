import { createHash, randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import type { PrismaService } from '../../src/platform/database/prisma.service';
import { jsonObject, type MasterValue } from '../../src/imports/import-values';

export async function createManualBatch(
  prisma: PrismaService,
  access: AccessContext,
  value: MasterValue,
  disposition: string,
) {
  const digest = createHash('sha256').update(randomUUID()).digest('hex');
  const batch = await prisma.importBatch.create({
    data: {
      organizationId: access.organizationId,
      sourceSha256: digest,
      receivedBy: access.actorUserId,
      status: 'VALIDATED',
    },
  });
  const source = await prisma.importSourceFile.create({
    data: {
      organizationId: access.organizationId,
      batchId: batch.id,
      originalName: 'rollback.xlsx',
      sha256: digest,
      sizeBytes: 1,
    },
  });
  const row = await prisma.importRow.create({
    data: {
      organizationId: access.organizationId,
      sourceFileId: source.id,
      sheetName: 'Master Sheet',
      rowNumber: 4,
      rowHash: digest,
      rawValues: {},
      normalizedValues: jsonObject(value),
      disposition,
    },
  });
  return { ...batch, rowId: row.id };
}
export function invalidMaster(legacyCode: string): MasterValue {
  return {
    legacyCode,
    state: 'Active',
    name: 'Rollback Student',
    phone: null,
    email: null,
    kind: 'Individual',
    branch: 'Main',
    deliveryMode: 'IN_PERSON',
    programCode: 'ROLLBACK',
    cohortCode: `RB-${legacyCode}`,
    subtotal: 0,
    discountAmount: 0,
    totalAmount: 0,
    paidAmount: 500,
    payments: [{ amount: 500, method: 'Cash', receivedAt: '2026-01-02T00:00:00.000Z' }],
  };
}
