import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateTokenService } from './certificate-token.service';
import { CertificateIssueService, type CertificateIssueResult } from './certificate-issue.service';
import {
  CertificateRevocationService,
  type CertificateRevokeResult,
} from './certificate-revocation.service';
import {
  CertificateFulfillmentService,
  type CertificateFulfillmentResult,
} from './certificate-fulfillment.service';
import { CertificateAccessService } from './certificate-access.service';
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CertificateEligibilityService,
    private readonly tokens: CertificateTokenService,
    private readonly issueService: CertificateIssueService,
    private readonly revocationService: CertificateRevocationService,
    private readonly fulfillmentService: CertificateFulfillmentService,
    private readonly accessService: CertificateAccessService,
  ) {}
  async evaluate(access: AccessContext, enrollmentId: string) {
    return this.prisma.serializable(async (transaction) => {
      await this.accessService.assertEnrollment(
        transaction,
        access,
        'certificates.issue',
        enrollmentId,
      );
      return this.eligibility.evaluate(transaction, access, enrollmentId);
    });
  }
  async issue(
    access: AccessContext,
    enrollmentId: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CertificateIssueResult> {
    return this.issueService.issue(access, enrollmentId, idempotencyKey, correlationId);
  }
  async reissue(
    access: AccessContext,
    certificateId: string,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CertificateIssueResult> {
    return this.issueService.reissue(access, certificateId, reason, idempotencyKey, correlationId);
  }
  async revoke(
    access: AccessContext,
    certificateId: string,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CertificateRevokeResult> {
    return this.revocationService.revoke(
      access,
      certificateId,
      reason,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }
  async fulfill(
    access: AccessContext,
    certificateId: string,
    target: 'PRINTED' | 'READY_FOR_COLLECTION' | 'COLLECTED',
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CertificateFulfillmentResult> {
    return this.fulfillmentService.fulfill(
      access,
      certificateId,
      target,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }
  async verify(token: string) {
    const certificateId = this.tokens.parseAndValidate(token);
    if (!certificateId) throw this.notFound();
    const certificate = await this.prisma.certificate.findFirst({
      where: { id: certificateId, verificationDigest: this.tokens.digest(token) },
    });
    if (!certificate) throw this.notFound();
    const enrollment = await this.prisma.enrollment.findUniqueOrThrow({
      where: { id: certificate.enrollmentId },
    });
    const [person, version] = await Promise.all([
      this.prisma.person.findUniqueOrThrow({ where: { id: enrollment.studentPersonId } }),
      this.prisma.programVersion.findUniqueOrThrow({ where: { id: enrollment.programVersionId } }),
    ]);
    const program = await this.prisma.program.findUniqueOrThrow({
      where: { id: version.programId },
    });
    return {
      name: person.name,
      programAr: program.name,
      programEn: program.name,
      serial: certificate.serial,
      issuedAt: certificate.issuedAt.toISOString(),
      validityStatus: certificate.validityStatus,
    };
  }
  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'CERTIFICATE_NOT_FOUND',
      messageKey: 'certificates.notFound',
    });
  }
}
