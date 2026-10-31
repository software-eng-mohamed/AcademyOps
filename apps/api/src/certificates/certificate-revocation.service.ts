import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { CertificateAccessService } from './certificate-access.service';

export type CertificateRevokeResult = { id: string; validityStatus: string; version: number };

@Injectable()
export class CertificateRevocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly accessService: CertificateAccessService,
  ) {}

  async revoke(
    access: AccessContext,
    certificateId: string,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CertificateRevokeResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.accessService.assertCertificate(
        transaction,
        access,
        'certificates.revoke',
        certificateId,
      );
      const attempt = await this.idempotency.begin<CertificateRevokeResult>(
        transaction,
        access.organizationId,
        'certificate.revoke',
        idempotencyKey,
        { certificateId, reason, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      await this.lockCertificate(transaction, access.organizationId, certificateId);
      const certificate = await transaction.certificate.findFirstOrThrow({
        where: { id: certificateId, organizationId: access.organizationId },
      });
      if (certificate.version !== expectedVersion) throw this.versionConflict();
      if (certificate.validityStatus === 'REVOKED') {
        const result = {
          id: certificate.id,
          validityStatus: certificate.validityStatus,
          version: certificate.version,
        };
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      const updated = await transaction.certificate.update({
        where: { id: certificate.id },
        data: {
          validityStatus: 'REVOKED',
          revokedAt: new Date(),
          revokedBy: access.actorUserId,
          revocationReason: reason,
          version: { increment: 1 },
        },
      });
      await transaction.certificateEvent.create({
        data: {
          organizationId: access.organizationId,
          certificateId: certificate.id,
          type: 'REVOKED',
          fromValue: certificate.validityStatus,
          toValue: 'REVOKED',
          reason,
          actorUserId: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'certificate.revoke',
        entityType: 'Certificate',
        entityId: certificate.id,
        correlationId,
        before: { validityStatus: certificate.validityStatus, version: certificate.version },
        after: { validityStatus: updated.validityStatus, version: updated.version, reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Certificate',
        aggregateId: certificate.id,
        type: 'certificate.revoked',
        payload: { certificateId: certificate.id, reason },
      });
      const result = {
        id: updated.id,
        validityStatus: updated.validityStatus,
        version: updated.version,
      };
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  private async lockCertificate(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    certificateId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM certificates
      WHERE id = ${certificateId}::uuid AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `;
  }

  private versionConflict(): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      messageKey: 'errors.versionConflict',
    });
  }
}
