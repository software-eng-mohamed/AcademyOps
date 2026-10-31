import { ConflictException, Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { FileStorageService } from '../platform/files/file-storage.service';
import { CertificateAccessService } from './certificate-access.service';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateTokenService } from './certificate-token.service';
import type { ListCertificatesDto } from './certificates.dto';
@Injectable()
export class CertificateReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: CertificateAccessService,
    private readonly eligibility: CertificateEligibilityService,
    private readonly tokens: CertificateTokenService,
    private readonly files: FileStorageService,
  ) {}
  async list(access: AccessContext, input: ListCertificatesDto) {
    return this.prisma.$transaction(async (transaction) => {
      const visibleIds = await this.accessService.visibleEnrollmentIds(
        transaction,
        access,
        'certificates.read',
      );
      if (input.enrollmentId) {
        await this.accessService.assertEnrollment(
          transaction,
          access,
          'certificates.read',
          input.enrollmentId,
        );
      }
      const certificates = await transaction.certificate.findMany({
        where: {
          organizationId: access.organizationId,
          ...(visibleIds === undefined ? {} : { enrollmentId: { in: visibleIds } }),
          ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
          ...(input.validityStatus ? { validityStatus: input.validityStatus } : {}),
        },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const page = certificates.slice(0, input.limit);
      const enrollments = await transaction.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: page.map(({ enrollmentId }) => enrollmentId) },
        },
      });
      const people = await transaction.person.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: enrollments.map(({ studentPersonId }) => studentPersonId) },
        },
        select: { id: true, publicId: true, name: true },
      });
      return {
        items: page.map((certificate) => {
          const enrollment = enrollments.find(({ id }) => id === certificate.enrollmentId);
          return {
            ...this.present(certificate),
            student: enrollment
              ? (people.find(({ id }) => id === enrollment.studentPersonId) ?? null)
              : null,
          };
        }),
        nextCursor: certificates.length > input.limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    });
  }
  async read(access: AccessContext, certificateId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const certificate = await this.accessService.assertCertificate(
        transaction,
        access,
        'certificates.read',
        certificateId,
      );
      const [evaluation, events, enrollment] = await Promise.all([
        transaction.eligibilityEvaluation.findFirstOrThrow({
          where: { organizationId: access.organizationId, id: certificate.evaluationId },
        }),
        transaction.certificateEvent.findMany({
          where: { organizationId: access.organizationId, certificateId: certificate.id },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        }),
        transaction.enrollment.findFirstOrThrow({
          where: { organizationId: access.organizationId, id: certificate.enrollmentId },
        }),
      ]);
      const [student, programVersion] = await Promise.all([
        transaction.person.findFirstOrThrow({
          where: { organizationId: access.organizationId, id: enrollment.studentPersonId },
          select: { id: true, publicId: true, name: true },
        }),
        transaction.programVersion.findFirstOrThrow({
          where: { organizationId: access.organizationId, id: enrollment.programVersionId },
        }),
      ]);
      const program = await transaction.program.findFirstOrThrow({
        where: { organizationId: access.organizationId, id: programVersion.programId },
        select: { id: true, code: true, name: true },
      });
      return {
        ...this.present(certificate),
        verificationToken: this.tokens.tokenFor(certificate.id),
        student,
        program,
        evaluation: {
          ...evaluation,
          attendanceRatio: evaluation.attendanceRatio?.toFixed(4) ?? null,
          evaluatedAt: evaluation.evaluatedAt.toISOString(),
          createdAt: evaluation.createdAt.toISOString(),
        },
        events: events.map((event) => ({
          ...event,
          occurredAt: event.occurredAt.toISOString(),
        })),
      };
    });
  }
  async evaluations(access: AccessContext, enrollmentId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.accessService.assertEnrollment(
        transaction,
        access,
        'certificates.read',
        enrollmentId,
      );
      const evaluations = await transaction.eligibilityEvaluation.findMany({
        where: { organizationId: access.organizationId, enrollmentId },
        orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      return {
        items: evaluations.map((evaluation) => ({
          ...evaluation,
          attendanceRatio: evaluation.attendanceRatio?.toFixed(4) ?? null,
          evaluatedAt: evaluation.evaluatedAt.toISOString(),
          createdAt: evaluation.createdAt.toISOString(),
        })),
      };
    });
  }
  async download(access: AccessContext, certificateId: string) {
    const asset = await this.prisma.$transaction(async (transaction) => {
      const certificate = await this.accessService.assertCertificate(
        transaction,
        access,
        'certificates.read',
        certificateId,
      );
      if (certificate.validityStatus !== 'ISSUED') {
        throw new ConflictException({
          code: 'CERTIFICATE_NOT_ACTIVE',
          messageKey: 'certificates.notActive',
        });
      }
      if (certificate.pdfStatus !== 'AVAILABLE' || !certificate.fileAssetId) {
        throw new ConflictException({
          code: 'CERTIFICATE_PDF_NOT_AVAILABLE',
          messageKey: 'certificates.pdfNotAvailable',
        });
      }
      const snapshot = await this.eligibility.snapshot(
        transaction,
        access.organizationId,
        certificate.enrollmentId,
      );
      if (snapshot.academicResult !== 'ELIGIBLE') {
        throw new ConflictException({
          code: 'CERTIFICATE_ACADEMIC_INELIGIBLE',
          messageKey: 'certificates.academicIneligible',
        });
      }
      if (snapshot.financialHold) {
        throw new ConflictException({
          code: 'CERTIFICATE_FINANCIAL_HOLD',
          messageKey: 'certificates.financialHold',
        });
      }
      return transaction.fileAsset.findFirstOrThrow({
        where: {
          organizationId: access.organizationId,
          id: certificate.fileAssetId,
          classification: 'PRIVATE',
          scanStatus: 'CLEAN',
        },
      });
    });
    return this.files.createDownloadUrl(asset, 300);
  }
  async checkEligibility(access: AccessContext, enrollmentId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.accessService.assertEnrollment(
        transaction,
        access,
        'certificates.read',
        enrollmentId,
      );
      const result = await this.eligibility.snapshot(
        transaction,
        access.organizationId,
        enrollmentId,
      );
      const overallEligibility = result.academicResult === 'ELIGIBLE' && !result.financialHold;
      return {
        attendanceRatio: result.ratio.ratio === null ? null : result.ratio.ratio.toFixed(4),
        minimumRatio: result.minimumRatio.toFixed(4),
        academicEligibility: result.academicResult,
        financialHold: result.financialHold,
        outstanding: result.outstanding.toFixed(2),
        completionSatisfied: result.completionSatisfied,
        overallEligibility,
        ruleId: result.rule.id,
      };
    });
  }
  private present(certificate: {
    id: string;
    enrollmentId: string;
    evaluationId: string;
    supersedesId: string | null;
    serial: string;
    validityStatus: string;
    fulfillmentStatus: string;
    pdfStatus: string;
    fileAssetId: string | null;
    issuedAt: Date;
    issuedBy: string;
    revokedAt: Date | null;
    revokedBy: string | null;
    revocationReason: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...certificate,
      issuedAt: certificate.issuedAt.toISOString(),
      revokedAt: certificate.revokedAt?.toISOString() ?? null,
      createdAt: certificate.createdAt.toISOString(),
      updatedAt: certificate.updatedAt.toISOString(),
    };
  }
}
