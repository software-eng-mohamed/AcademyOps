import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { decryptLegacyArchive } from './import-archive-crypto';
import type { ListLegacyArchiveDto } from './imports.dto';

@Injectable()
export class LegacyArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  async list(access: AccessContext, query: ListLegacyArchiveDto) {
    const records = await this.prisma.legacyArchiveRecord.findMany({
      where: {
        organizationId: access.organizationId,
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.sheetName
          ? { sheetName: { contains: query.sheetName, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        batchId: true,
        category: true,
        sourceFileId: true,
        sheetName: true,
        rowNumber: true,
        dataHash: true,
        createdAt: true,
      },
    });
    const visible = records.slice(0, query.limit);
    const files = await this.prisma.importSourceFile.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: visible.map(({ sourceFileId }) => sourceFileId) },
      },
      select: { id: true, originalName: true },
    });
    const names = new Map(files.map((file) => [file.id, file.originalName]));
    return {
      items: visible.map((record) => ({
        ...record,
        sourceFileName: names.get(record.sourceFileId) ?? null,
      })),
      nextCursor: records.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
    };
  }

  async read(access: AccessContext, id: string) {
    const record = await this.prisma.legacyArchiveRecord.findFirst({
      where: { organizationId: access.organizationId, id },
    });
    if (!record) {
      throw new NotFoundException({
        code: 'LEGACY_ARCHIVE_RECORD_NOT_FOUND',
        messageKey: 'imports.legacyArchiveRecordNotFound',
      });
    }
    const secret = process.env.LEGACY_ARCHIVE_KEY;
    if (!secret || secret.length < 32) {
      throw new ConflictException({
        code: 'LEGACY_ARCHIVE_KEY_REQUIRED',
        messageKey: 'imports.legacy_archive_key_required',
      });
    }
    const plaintext = decryptLegacyArchive(record.encryptedData, secret);
    let data: unknown;
    try {
      data = JSON.parse(plaintext) as unknown;
    } catch {
      data = plaintext;
    }
    const source = await this.prisma.importSourceFile.findFirst({
      where: { organizationId: access.organizationId, id: record.sourceFileId },
      select: { originalName: true },
    });
    return {
      id: record.id,
      batchId: record.batchId,
      category: record.category,
      sourceFileId: record.sourceFileId,
      sourceFileName: source?.originalName ?? null,
      sheetName: record.sheetName,
      rowNumber: record.rowNumber,
      dataHash: record.dataHash,
      data,
      createdAt: record.createdAt,
    };
  }
}
