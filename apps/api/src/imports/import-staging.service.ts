import { BadRequestException, Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { ImportLifecycleEventsService } from './import-lifecycle-events.service';
import { stableRowHash } from './normalization';
import { readXlsxValues } from './xlsx-reader';

@Injectable()
export class ImportStagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ImportLifecycleEventsService,
  ) {}

  async stage(access: AccessContext, originalName: string, buffer: Buffer) {
    if (!originalName.toLowerCase().endsWith('.xlsx')) throw this.invalidWorkbook();
    let workbook: ReturnType<typeof readXlsxValues>;
    try {
      workbook = readXlsxValues(buffer);
    } catch {
      throw this.invalidWorkbook();
    }
    return this.prisma.serializable(async (transaction) => {
      const existing = await transaction.importBatch.findFirst({
        where: { organizationId: access.organizationId, sourceSha256: workbook.sha256 },
      });
      if (existing)
        return {
          id: existing.id,
          status: existing.status,
          sha256: existing.sourceSha256,
          duplicate: true,
        };
      const batch = await transaction.importBatch.create({
        data: {
          organizationId: access.organizationId,
          sourceSha256: workbook.sha256,
          receivedBy: access.actorUserId,
          status: 'STAGED',
        },
      });
      const source = await transaction.importSourceFile.create({
        data: {
          organizationId: access.organizationId,
          batchId: batch.id,
          originalName,
          sha256: workbook.sha256,
          sizeBytes: BigInt(buffer.byteLength),
          workbookMeta: {
            sheets: workbook.sheets.map((sheet) => ({
              name: sheet.name,
              state: sheet.state,
              rowCount: sheet.rows.length,
            })),
            entryCount: workbook.entryCount,
            uncompressedBytes: workbook.uncompressedBytes,
            commentCount: workbook.commentCount,
            commentsIgnored: false,
          },
        },
      });
      const rows = workbook.sheets.flatMap((sheet) => {
        const hashes = new Set<string>();
        return sheet.rows.map((row) => {
          const rawValues = row.comments?.length
            ? { ...row.values, __PLG_COMMENTS__: row.comments }
            : row.values;
          const contentHash = stableRowHash(rawValues);
          const rowHash = hashes.has(contentHash)
            ? stableRowHash({ ...rawValues, __PLG_ROW_NUMBER__: row.rowNumber })
            : contentHash;
          hashes.add(rowHash);
          return {
            organizationId: access.organizationId,
            sourceFileId: source.id,
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            rowHash,
            rawValues,
            disposition: sheet.state === 'visible' ? 'STAGED' : 'ARCHIVED',
          };
        });
      });
      for (let offset = 0; offset < rows.length; offset += 500) {
        await transaction.importRow.createMany({ data: rows.slice(offset, offset + 500) });
      }
      await this.events.staged(transaction, access.organizationId, batch.id, rows.length);
      return {
        id: batch.id,
        status: batch.status,
        sha256: workbook.sha256,
        duplicate: false,
        rowCount: rows.length,
      };
    });
  }

  private invalidWorkbook(): BadRequestException {
    return new BadRequestException({
      code: 'IMPORT_WORKBOOK_INVALID',
      messageKey: 'imports.workbookInvalid',
    });
  }
}
