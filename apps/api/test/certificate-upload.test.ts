import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CertificateUploadService } from '../src/certificates/certificate-upload.service';

function service(): CertificateUploadService {
  return new CertificateUploadService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
}

function attempt(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
  return service().upload(
    undefined as never,
    '00000000-0000-4000-8000-000000000001',
    1,
    'certificate-upload-test',
    'certificate-upload-test',
    file,
  );
}

describe('certificate PDF upload validation', () => {
  it('rejects a non-PDF before storage or database access', async () => {
    const buffer = Buffer.from('not a pdf');
    await expect(
      attempt({ buffer, size: buffer.length, mimetype: 'text/plain', originalname: 'fake.pdf' }),
    ).rejects.toMatchObject({
      response: { code: 'CERTIFICATE_PDF_INVALID' },
    });
  });

  it('rejects active PDF content before storage or database access', async () => {
    const buffer = Buffer.from('%PDF-1.7\n1 0 obj << /JavaScript 2 0 R >> endobj\n%%EOF');
    await expect(
      attempt({
        buffer,
        size: buffer.length,
        mimetype: 'application/pdf',
        originalname: 'active.pdf',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CERTIFICATE_PDF_ACTIVE_CONTENT_REJECTED' },
    });
  });

  it.each(['/Java#53cript', '/Type /ObjStm', '/Encrypt'])(
    'rejects obfuscated or compressed active content marker %s',
    async (marker) => {
      const buffer = Buffer.from(`%PDF-1.7\n1 0 obj << ${marker} 2 0 R >> endobj\n%%EOF`);
      await expect(
        attempt({
          buffer,
          size: buffer.length,
          mimetype: 'application/pdf',
          originalname: 'active.pdf',
        }),
      ).rejects.toMatchObject({
        response: { code: 'CERTIFICATE_PDF_ACTIVE_CONTENT_REJECTED' },
      });
    },
  );

  it('rejects a PDF polyglot with non-whitespace data after EOF', async () => {
    const buffer = Buffer.concat([
      Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    ]);
    await expect(
      attempt({
        buffer,
        size: buffer.length,
        mimetype: 'application/pdf',
        originalname: 'polyglot.pdf',
      }),
    ).rejects.toMatchObject({ response: { code: 'CERTIFICATE_PDF_INVALID' } });
  });

  it('never stores or marks a PDF CLEAN before ClamAV returns OK', async () => {
    const prisma = {
      serializable: vi.fn().mockResolvedValue({
        replayed: false,
        attemptId: 'attempt',
        recordId: 'record',
        sizeBytes: 10,
        storageKey: 'key',
        needsStorage: true,
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const scanner = {
      scan: vi.fn().mockRejectedValue(
        new ServiceUnavailableException({
          code: 'CERTIFICATE_MALWARE_SCAN_UNAVAILABLE',
          messageKey: 'certificates.malwareScanUnavailable',
        }),
      ),
    };
    const files = { putPrivate: vi.fn() };
    const upload = new CertificateUploadService(
      prisma as never,
      {} as never,
      scanner as never,
      files as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const buffer = Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF');

    await expect(
      upload.upload(
        { organizationId: 'org', actorUserId: 'user' } as never,
        'certificate',
        1,
        'idempotency',
        'correlation',
        { buffer, size: buffer.length, mimetype: 'application/pdf', originalname: 'clean.pdf' },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(scanner.scan).toHaveBeenCalledWith(buffer);
    expect(files.putPrivate).not.toHaveBeenCalled();
    expect(prisma.serializable).toHaveBeenCalledOnce();
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it('rejects a stale reservation before scanning or writing storage', async () => {
    const prisma = {
      serializable: vi
        .fn()
        .mockRejectedValue(
          new ConflictException({ code: 'VERSION_CONFLICT', messageKey: 'errors.versionConflict' }),
        ),
    };
    const scanner = { scan: vi.fn() };
    const files = { putPrivate: vi.fn() };
    const upload = new CertificateUploadService(
      prisma as never,
      {} as never,
      scanner as never,
      files as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(uploadClean(upload)).rejects.toMatchObject({ status: 409 });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(files.putPrivate).not.toHaveBeenCalled();
  });

  it('returns a completed idempotent reservation without rescanning or reuploading', async () => {
    const response = {
      id: 'certificate',
      fileAssetId: 'asset',
      pdfStatus: 'AVAILABLE',
      version: 2,
      sha256: 'a'.repeat(64),
    } as const;
    const prisma = { serializable: vi.fn().mockResolvedValue({ replayed: true, response }) };
    const scanner = { scan: vi.fn() };
    const files = { putPrivate: vi.fn() };
    const upload = new CertificateUploadService(
      prisma as never,
      {} as never,
      scanner as never,
      files as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(uploadClean(upload)).resolves.toEqual(response);
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(files.putPrivate).not.toHaveBeenCalled();
  });

  it('compensates a post-write finalization race and leaves a tracked FAILED asset', async () => {
    const reservation = {
      replayed: false,
      attemptId: 'attempt',
      recordId: 'record',
      sizeBytes: 10,
      storageKey: 'key',
      needsStorage: true,
    };
    const prisma = {
      serializable: vi
        .fn()
        .mockResolvedValueOnce(reservation)
        .mockRejectedValueOnce(
          new ConflictException({ code: 'VERSION_CONFLICT', messageKey: 'errors.versionConflict' }),
        ),
      fileAsset: {
        count: vi.fn().mockResolvedValue(0),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const scanner = { scan: vi.fn().mockResolvedValue(undefined) };
    const files = {
      putPrivate: vi.fn().mockResolvedValue({ storageKey: 'key', sizeBytes: 10n }),
      deletePrivate: vi.fn().mockResolvedValue(undefined),
    };
    const upload = new CertificateUploadService(
      prisma as never,
      {} as never,
      scanner as never,
      files as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(uploadClean(upload)).rejects.toMatchObject({ status: 409 });
    expect(files.putPrivate).toHaveBeenCalledOnce();
    expect(files.deletePrivate).toHaveBeenCalledOnce();
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it('preserves the finalization error and terminalizes the attempt when R2 cleanup fails', async () => {
    const finalizationError = new ConflictException({
      code: 'VERSION_CONFLICT',
      messageKey: 'errors.versionConflict',
    });
    const prisma = {
      serializable: vi
        .fn()
        .mockResolvedValueOnce({
          replayed: false,
          attemptId: 'attempt',
          recordId: 'record',
          sizeBytes: 10,
          storageKey: 'key',
          needsStorage: true,
        })
        .mockRejectedValueOnce(finalizationError),
      fileAsset: { count: vi.fn().mockResolvedValue(0) },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const files = {
      putPrivate: vi.fn().mockResolvedValue({ storageKey: 'key', sizeBytes: 10n }),
      deletePrivate: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
    };
    const upload = new CertificateUploadService(
      prisma as never,
      {} as never,
      { scan: vi.fn().mockResolvedValue(undefined) } as never,
      files as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(uploadClean(upload)).rejects.toBe(finalizationError);
    expect(files.deletePrivate).toHaveBeenCalledOnce();
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });
});

function uploadClean(upload: CertificateUploadService) {
  const buffer = Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF');
  return upload.upload(
    { organizationId: 'org', actorUserId: 'user' } as never,
    'certificate',
    1,
    'idempotency',
    'correlation',
    { buffer, size: buffer.length, mimetype: 'application/pdf', originalname: 'clean.pdf' },
  );
}
