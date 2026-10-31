import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { FileStorageService } from '../platform/files/file-storage.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { CertificateAccessService } from './certificate-access.service';
import { ClamavScannerService } from './clamav-scanner.service';
import { validateCertificatePdf } from './certificate-pdf-validator';
import {
  assertCertificateUploadable,
  certificateScanFailureStatus,
  certificateUploadInProgress,
} from './certificate-upload-errors';
import {
  compensateCertificateUpload,
  finishCertificateUploadAttempt,
} from './certificate-upload-recovery';

export type CertificateUploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type UploadResult = {
  id: string;
  fileAssetId: string;
  pdfStatus: 'AVAILABLE';
  version: number;
  sha256: string;
};

type Reservation =
  | { replayed: true; response: UploadResult }
  | {
      replayed: false;
      attemptId: string;
      recordId: string;
      sizeBytes: number;
      storageKey: string;
      needsStorage: boolean;
    };

@Injectable()
export class CertificateUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: CertificateAccessService,
    private readonly scanner: ClamavScannerService,
    private readonly files: FileStorageService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async upload(
    access: AccessContext,
    certificateId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
    file: CertificateUploadFile | undefined,
  ): Promise<UploadResult> {
    const validated = validateCertificatePdf(file);
    const storageKey = `certificates/${access.organizationId}/${certificateId}/uploads/${validated.sha256}.pdf`;
    const reservation = await this.reserve(
      access,
      certificateId,
      expectedVersion,
      idempotencyKey,
      storageKey,
      validated,
    );
    if (reservation.replayed) return reservation.response;

    if (reservation.needsStorage) {
      try {
        await this.scanner.scan(validated.bytes);
      } catch (error) {
        await finishCertificateUploadAttempt(
          this.prisma,
          reservation.attemptId,
          certificateScanFailureStatus(error),
        );
        throw error;
      }
      try {
        await this.files.putPrivate(storageKey, validated.bytes, 'application/pdf');
      } catch (error) {
        await finishCertificateUploadAttempt(this.prisma, reservation.attemptId, 'FAILED');
        throw error;
      }
    }

    try {
      return await this.finalize(
        access,
        certificateId,
        expectedVersion,
        correlationId,
        reservation,
        validated.sha256,
      );
    } catch (error) {
      if (reservation.needsStorage) {
        await compensateCertificateUpload(
          this.prisma,
          this.files,
          access.organizationId,
          reservation.attemptId,
          storageKey,
        );
      } else {
        await finishCertificateUploadAttempt(this.prisma, reservation.attemptId, 'FAILED');
      }
      throw error;
    }
  }

  private reserve(
    access: AccessContext,
    certificateId: string,
    expectedVersion: number,
    idempotencyKey: string,
    storageKey: string,
    file: { bytes: Buffer; sha256: string },
  ): Promise<Reservation> {
    return this.prisma.serializable(async (transaction) => {
      await this.accessService.assertCertificate(
        transaction,
        access,
        'certificates.upload',
        certificateId,
      );
      await transaction.$queryRaw`SELECT id FROM certificates WHERE id = ${certificateId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const certificate = await this.accessService.assertCertificate(
        transaction,
        access,
        'certificates.upload',
        certificateId,
      );
      const attempt = await this.idempotency.begin<UploadResult>(
        transaction,
        access.organizationId,
        'certificate.file.upload',
        idempotencyKey,
        { certificateId, expectedVersion, sha256: file.sha256, sizeBytes: file.bytes.byteLength },
      );
      if (attempt.replayed) return { replayed: true, response: attempt.response };
      assertCertificateUploadable(certificate, expectedVersion);

      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${access.organizationId}:${certificateId}:${storageKey}`}, 0))`;
      await transaction.$executeRaw`
        UPDATE certificate_file_upload_attempts
        SET status = 'FAILED', completed_at = now(), updated_at = now()
        WHERE organization_id = ${access.organizationId}::uuid
          AND certificate_id = ${certificateId}::uuid
          AND storage_key = ${storageKey}
          AND status = 'PENDING'
          AND updated_at < now() - interval '15 minutes'
      `;
      const pending = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM certificate_file_upload_attempts
        WHERE organization_id = ${access.organizationId}::uuid
          AND certificate_id = ${certificateId}::uuid
          AND storage_key = ${storageKey}
          AND status = 'PENDING'
        LIMIT 1
      `;
      if (pending.length) throw certificateUploadInProgress();
      const existing = await transaction.fileAsset.findFirst({
        where: { organizationId: access.organizationId, storageKey, scanStatus: 'CLEAN' },
      });
      const rows = await transaction.$queryRaw<Array<{ id: string }>>`
        INSERT INTO certificate_file_upload_attempts (
          id, organization_id, certificate_id, idempotency_record_id, storage_key,
          sha256, size_bytes, status, created_by, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${access.organizationId}::uuid, ${certificateId}::uuid,
          ${attempt.recordId}::uuid, ${storageKey}, ${file.sha256}, ${file.bytes.byteLength},
          'PENDING', ${access.actorUserId}::uuid, now(), now()
        ) RETURNING id::text
      `;
      const attemptId = rows[0]?.id;
      if (!attemptId) throw new Error('Certificate upload reservation did not return an id');
      return {
        replayed: false,
        attemptId,
        recordId: attempt.recordId,
        sizeBytes: file.bytes.byteLength,
        storageKey,
        needsStorage: !existing,
      };
    });
  }

  private finalize(
    access: AccessContext,
    certificateId: string,
    expectedVersion: number,
    correlationId: string,
    reservation: Exclude<Reservation, { replayed: true }>,
    sha256: string,
  ): Promise<UploadResult> {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM certificates WHERE id = ${certificateId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const certificate = await this.accessService.assertCertificate(
        transaction,
        access,
        'certificates.upload',
        certificateId,
      );
      assertCertificateUploadable(certificate, expectedVersion);
      const advanced = await transaction.$executeRaw`
        UPDATE certificate_file_upload_attempts
        SET status = 'CLEAN', completed_at = now(), updated_at = now()
        WHERE id = ${reservation.attemptId}::uuid
          AND organization_id = ${access.organizationId}::uuid
          AND status = 'PENDING'
      `;
      if (advanced !== 1) throw certificateUploadInProgress();
      const existing = await transaction.fileAsset.findFirst({
        where: {
          organizationId: access.organizationId,
          storageKey: reservation.storageKey,
          scanStatus: 'CLEAN',
        },
      });
      const asset =
        existing ??
        (await transaction.fileAsset.create({
          data: {
            organizationId: access.organizationId,
            storageKey: reservation.storageKey,
            contentType: 'application/pdf',
            sizeBytes: reservation.sizeBytes,
            sha256,
            classification: 'PRIVATE',
            scanStatus: 'CLEAN',
            createdBy: access.actorUserId,
          },
        }));
      const updated = await transaction.certificate.update({
        where: { id: certificate.id },
        data: { pdfStatus: 'AVAILABLE', fileAssetId: asset.id, version: { increment: 1 } },
      });
      const eventType = certificate.fileAssetId ? 'PDF_REPLACED' : 'PDF_UPLOADED';
      await transaction.certificateEvent.create({
        data: {
          organizationId: access.organizationId,
          certificateId,
          type: eventType,
          fromValue: certificate.fileAssetId,
          toValue: asset.id,
          actorUserId: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action:
          eventType === 'PDF_UPLOADED' ? 'certificate.file.upload' : 'certificate.file.replace',
        entityType: 'Certificate',
        entityId: certificateId,
        correlationId,
        before: { fileAssetId: certificate.fileAssetId, version: certificate.version },
        after: { fileAssetId: asset.id, sha256, version: updated.version },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Certificate',
        aggregateId: certificateId,
        type:
          eventType === 'PDF_UPLOADED' ? 'certificate.file.uploaded' : 'certificate.file.replaced',
        payload: { certificateId, fileAssetId: asset.id },
      });
      const result: UploadResult = {
        id: updated.id,
        fileAssetId: asset.id,
        pdfStatus: 'AVAILABLE',
        version: updated.version,
        sha256,
      };
      await this.idempotency.complete(transaction, reservation.recordId, 201, result);
      return result;
    });
  }
}
