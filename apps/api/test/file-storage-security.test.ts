import { ConfigService } from '@nestjs/config';
import type { FileAsset } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { FileStorageService } from '../src/platform/files/file-storage.service';
import type { PrismaService } from '../src/platform/database/prisma.service';

const asset = {
  id: '11111111-1111-4111-8111-111111111111',
  classification: 'PRIVATE',
  scanStatus: 'CLEAN',
  contentType: 'application/pdf',
  storageKey: 'safe/file.pdf',
  sizeBytes: 10n,
} as FileAsset;

describe('private file download policy', () => {
  it.each([
    { classification: 'PUBLIC', scanStatus: 'CLEAN' },
    { classification: 'PRIVATE', scanStatus: 'PENDING' },
    { classification: 'PRIVATE', scanStatus: 'REJECTED' },
    { classification: 'PRIVATE', scanStatus: 'FAILED' },
  ])('refuses a non-clean or non-private asset', async (state) => {
    const service = new FileStorageService(
      new ConfigService({
        WEB_ORIGIN: 'http://localhost:3000',
        FILE_SIGNING_SECRET: 'x'.repeat(32),
        PRIVATE_FILE_STORAGE_ROOT: 'work/test-private-files',
      }),
      {} as PrismaService,
    );

    await expect(service.createDownloadUrl({ ...asset, ...state })).rejects.toMatchObject({
      status: 404,
    });
  });
});
