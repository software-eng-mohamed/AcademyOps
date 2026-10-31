import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { encryptLegacyArchive, legacyArchiveHash } from './import-archive-crypto';

type ArchiveRow = {
  id: string;
  sourceFileId: string;
  sheetName: string;
  rowNumber: number;
  rawValues: Prisma.JsonValue;
  disposition: string;
};

@Injectable()
export class ImportArchiveWriter {
  async archive(
    db: Prisma.TransactionClient,
    access: AccessContext,
    batchId: string,
    rows: ArchiveRow[],
  ): Promise<void> {
    const archived = rows.filter((row) => row.disposition === 'ARCHIVED');
    if (!archived.length) return;
    const secret = process.env.LEGACY_ARCHIVE_KEY;
    if (!secret || secret.length < 32)
      throw new ConflictException({
        code: 'LEGACY_ARCHIVE_KEY_REQUIRED',
        messageKey: 'imports.legacy_archive_key_required',
      });
    const existing = await db.legacyArchiveRecord.findMany({
      where: { organizationId: access.organizationId, batchId },
      select: { sourceFileId: true, sheetName: true, rowNumber: true },
    });
    const keys = new Set(
      existing.map((row) => `${row.sourceFileId}|${row.sheetName}|${row.rowNumber}`),
    );
    const records = archived
      .filter((row) => !keys.has(`${row.sourceFileId}|${row.sheetName}|${row.rowNumber}`))
      .map((row) => {
        const plaintext = JSON.stringify(row.rawValues);
        return {
          organizationId: access.organizationId,
          batchId,
          category: 'ARCHIVE_ONLY',
          sourceFileId: row.sourceFileId,
          sheetName: row.sheetName,
          rowNumber: row.rowNumber,
          encryptedData: encryptLegacyArchive(plaintext, secret),
          dataHash: legacyArchiveHash(plaintext),
        };
      });
    for (let offset = 0; offset < records.length; offset += 500)
      await db.legacyArchiveRecord.createMany({ data: records.slice(offset, offset + 500) });
    await db.importRow.updateMany({
      where: { id: { in: archived.map((row) => row.id) } },
      data: { rawValues: { archived: true } },
    });
  }
}
