import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { PrismaService } from '../platform/database/prisma.service';
import { CertificateAccessService } from './certificate-access.service';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateTokenService } from './certificate-token.service';

export type CertificateIssueResult = {
  id: string;
  serial: string;
  verificationToken: string;
  validityStatus: string;
  pdfStatus: string;
  version: number;
};

@Injectable()
export class CertificateIssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly accessService: CertificateAccessService,
    private readonly eligibility: CertificateEligibilityService,
    private readonly tokens: CertificateTokenService,
  ) {}

  async issue(
    access: AccessContext,
    enrollmentId: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CertificateIssueResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.accessService.assertEnrollment(
        transaction,
        access,
        'certificates.issue',
        enrollmentId,
      );
      const attempt = await this.idempotency.begin<CertificateIssueResult>(
        transaction,
        access.organizationId,
        'certificate.issue',
        idempotencyKey,
        { enrollmentId },
      );
      if (attempt.replayed) return attempt.response;
      await this.lockEnrollment(transaction, access.organizationId, enrollmentId);
      const existing = await transaction.certificate.findFirst({
        where: { organizationId: access.organizationId, enrollmentId, validityStatus: 'ISSUED' },
      });
      if (existing) {
        const result = this.issueResult(existing);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      const revoked = await transaction.certificate.findFirst({
        where: { organizationId: access.organizationId, enrollmentId, validityStatus: 'REVOKED' },
        orderBy: { issuedAt: 'desc' },
        select: { id: true },
      });
      if (revoked) {
        throw new ConflictException({
          code: 'CERTIFICATE_REISSUE_REQUIRED',
          messageKey: 'certificates.reissueRequired',
        });
      }
      const evaluation = await this.eligibility.evaluate(transaction, access, enrollmentId);
      this.assertIssuable(evaluation);
      const certificate = await this.createCertificate(
        transaction,
        access,
        enrollmentId,
        evaluation.id,
        null,
        'ISSUED',
        correlationId,
      );
      const result = this.issueResult(certificate);
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async reissue(
    access: AccessContext,
    certificateId: string,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CertificateIssueResult> {
    return this.prisma.serializable(async (transaction) => {
      const previous = await this.accessService.assertCertificate(
        transaction,
        access,
        'certificates.issue',
        certificateId,
      );
      const attempt = await this.idempotency.begin<CertificateIssueResult>(
        transaction,
        access.organizationId,
        'certificate.reissue',
        idempotencyKey,
        { certificateId, reason },
      );
      if (attempt.replayed) return attempt.response;
      await this.lockEnrollment(transaction, access.organizationId, previous.enrollmentId);
      await this.lockCertificate(transaction, access.organizationId, certificateId);
      const current = await transaction.certificate.findUniqueOrThrow({
        where: { id: certificateId },
      });
      if (current.validityStatus !== 'REVOKED') {
        throw new ConflictException({
          code: 'CERTIFICATE_REISSUE_INVALID',
          messageKey: 'certificates.reissueInvalid',
        });
      }
      const active = await transaction.certificate.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId: current.enrollmentId,
          validityStatus: 'ISSUED',
        },
      });
      if (active) {
        throw new ConflictException({
          code: 'CERTIFICATE_ALREADY_ACTIVE',
          messageKey: 'certificates.alreadyActive',
        });
      }
      const evaluation = await this.eligibility.evaluate(transaction, access, current.enrollmentId);
      this.assertIssuable(evaluation);
      const certificate = await this.createCertificate(
        transaction,
        access,
        current.enrollmentId,
        evaluation.id,
        current.id,
        'REISSUED',
        correlationId,
        reason,
      );
      const result = this.issueResult(certificate);
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  private async createCertificate(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    enrollmentId: string,
    evaluationId: string,
    supersedesId: string | null,
    eventType: 'ISSUED' | 'REISSUED',
    correlationId: string,
    reason?: string,
  ) {
    const serialNumber = await this.nextSerial(transaction, access.organizationId);
    const certificateId = randomUUID();
    const token = this.tokens.tokenFor(certificateId);
    let certificate;
    try {
      certificate = await transaction.certificate.create({
        data: {
          id: certificateId,
          organizationId: access.organizationId,
          enrollmentId,
          evaluationId,
          supersedesId,
          serial: `AO-CERT-${new Date().getUTCFullYear()}-${serialNumber.toString().padStart(6, '0')}`,
          verificationDigest: this.tokens.digest(token),
          pdfStatus: 'PENDING_UPLOAD',
          issuedBy: access.actorUserId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'CERTIFICATE_ALREADY_ACTIVE',
          messageKey: 'certificates.alreadyActive',
        });
      }
      throw error;
    }
    await transaction.certificateEvent.create({
      data: {
        organizationId: access.organizationId,
        certificateId: certificate.id,
        type: eventType,
        toValue: 'ISSUED',
        ...(reason ? { reason } : {}),
        actorUserId: access.actorUserId,
      },
    });
    await this.audit.write(transaction, {
      organizationId: access.organizationId,
      actorUserId: access.actorUserId,
      action: eventType === 'ISSUED' ? 'certificate.issue' : 'certificate.reissue',
      entityType: 'Certificate',
      entityId: certificate.id,
      correlationId,
      after: { serial: certificate.serial, supersedesId, reason: reason ?? null },
    });
    return certificate;
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

  private issueResult(certificate: {
    id: string;
    serial: string;
    validityStatus: string;
    pdfStatus: string;
    version: number;
  }): CertificateIssueResult {
    return {
      id: certificate.id,
      serial: certificate.serial,
      verificationToken: this.tokens.tokenFor(certificate.id),
      validityStatus: certificate.validityStatus,
      pdfStatus: certificate.pdfStatus,
      version: certificate.version,
    };
  }

  private async lockEnrollment(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    enrollmentId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM enrollments
      WHERE id = ${enrollmentId}::uuid AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `;
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

  private async nextSerial(
    transaction: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<bigint> {
    const year = new Date().getUTCFullYear();
    const rows = await transaction.$queryRaw<Array<{ serial_number: bigint }>>`
      INSERT INTO document_sequences (id, organization_id, fiscal_year, document_type, next_value, updated_at)
      VALUES (gen_random_uuid(), ${organizationId}::uuid, ${year}, 'CERTIFICATE', 2, now())
      ON CONFLICT (organization_id, fiscal_year, document_type)
      DO UPDATE SET next_value = document_sequences.next_value + 1, updated_at = now()
      RETURNING next_value - 1 AS serial_number
    `;
    if (rows[0]?.serial_number === undefined) throw new Error('Certificate sequence failed');
    return rows[0].serial_number;
  }
}
