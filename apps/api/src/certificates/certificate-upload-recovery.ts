import type { PrismaService } from '../platform/database/prisma.service';
import type { FileStorageService } from '../platform/files/file-storage.service';

export type CertificateUploadFailure = 'FAILED' | 'REJECTED';

export async function finishCertificateUploadAttempt(
  prisma: PrismaService,
  attemptId: string,
  status: CertificateUploadFailure,
): Promise<void> {
  await prisma.$executeRaw`
      UPDATE certificate_file_upload_attempts
      SET status = ${status}, completed_at = now(), updated_at = now()
      WHERE id = ${attemptId}::uuid AND status = 'PENDING'
    `.catch(() => undefined);
}

export async function compensateCertificateUpload(
  prisma: PrismaService,
  files: FileStorageService,
  organizationId: string,
  attemptId: string,
  storageKey: string,
): Promise<void> {
  let safeToDelete = false;
  try {
    const cleanAsset = await prisma.fileAsset.count({
      where: { organizationId, storageKey, scanStatus: 'CLEAN' },
    });
    const otherPending = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM certificate_file_upload_attempts
      WHERE organization_id = ${organizationId}::uuid
        AND storage_key = ${storageKey}
        AND status = 'PENDING'
        AND id <> ${attemptId}::uuid
      LIMIT 1
    `;
    safeToDelete = cleanAsset === 0 && otherPending.length === 0;
  } catch {
    safeToDelete = false;
  }
  if (safeToDelete) await files.deletePrivate(storageKey).catch(() => undefined);
  await finishCertificateUploadAttempt(prisma, attemptId, 'FAILED');
}
