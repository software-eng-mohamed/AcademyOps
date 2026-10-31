import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { PrismaService } from '../platform/database/prisma.service';
import { CertificateAccessService } from './certificate-access.service';
import { CertificateEligibilityService } from './certificate-eligibility.service';

export type CertificateFulfillmentResult = {
  id: string;
  fulfillmentStatus: string;
  version: number;
};

@Injectable()
export class CertificateFulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly accessService: CertificateAccessService,
    private readonly eligibility: CertificateEligibilityService,
  ) {}

  async fulfill(
    access: AccessContext,
    certificateId: string,
    target: 'PRINTED' | 'READY_FOR_COLLECTION' | 'COLLECTED',
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CertificateFulfillmentResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.accessService.assertCertificate(
        transaction,
        access,
        'certificates.collect',
        certificateId,
      );
      const attempt = await this.idempotency.begin<CertificateFulfillmentResult>(
        transaction,
        access.organizationId,
        'certificate.fulfill',
        idempotencyKey,
        { certificateId, target, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      await this.lockCertificate(transaction, access.organizationId, certificateId);
      const certificate = await transaction.certificate.findFirstOrThrow({
        where: { id: certificateId, organizationId: access.organizationId },
      });
      if (certificate.version !== expectedVersion) throw this.versionConflict();
      if (certificate.validityStatus !== 'ISSUED') {
        throw new ConflictException({
          code: 'CERTIFICATE_NOT_ACTIVE',
          messageKey: 'certificates.notActive',
        });
      }
      if (target === 'PRINTED' && certificate.pdfStatus !== 'AVAILABLE') {
        throw new ConflictException({
          code: 'CERTIFICATE_PDF_NOT_AVAILABLE',
          messageKey: 'certificates.pdfNotAvailable',
        });
      }
      const transitions: Record<string, string> = {
        NOT_PRINTED: 'PRINTED',
        PRINTED: 'READY_FOR_COLLECTION',
        READY_FOR_COLLECTION: 'COLLECTED',
      };
      if (transitions[certificate.fulfillmentStatus] !== target) {
        throw new ConflictException({
          code: 'CERTIFICATE_FULFILLMENT_INVALID',
          messageKey: 'certificates.fulfillmentInvalid',
        });
      }
      const snapshot = await this.eligibility.snapshot(
        transaction,
        access.organizationId,
        certificate.enrollmentId,
      );
      this.assertIssuable({
        academicResult: snapshot.academicResult,
        financialHold: snapshot.financialHold,
      });
      const updated = await transaction.certificate.update({
        where: { id: certificate.id },
        data: { fulfillmentStatus: target, version: { increment: 1 } },
      });
      await transaction.certificateEvent.create({
        data: {
          organizationId: access.organizationId,
          certificateId: certificate.id,
          type: 'FULFILLMENT_CHANGED',
          fromValue: certificate.fulfillmentStatus,
          toValue: target,
          actorUserId: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'certificate.fulfillment.change',
        entityType: 'Certificate',
        entityId: certificate.id,
        correlationId,
        before: { status: certificate.fulfillmentStatus, version: certificate.version },
        after: { status: updated.fulfillmentStatus, version: updated.version },
      });
      const result = {
        id: updated.id,
        fulfillmentStatus: updated.fulfillmentStatus,
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

  private assertIssuable(evaluation: { academicResult: string; financialHold: boolean }): void {
    if (evaluation.academicResult !== 'ELIGIBLE') {
      throw new ConflictException({
        code: 'CERTIFICATE_ACADEMIC_INELIGIBLE',
        messageKey: 'certificates.academicIneligible',
      });
    }
    if (evaluation.financialHold) {
      throw new ConflictException({
        code: 'CERTIFICATE_FINANCIAL_HOLD',
        messageKey: 'certificates.financialHold',
      });
    }
  }

  private versionConflict(): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      messageKey: 'errors.versionConflict',
    });
  }
}
