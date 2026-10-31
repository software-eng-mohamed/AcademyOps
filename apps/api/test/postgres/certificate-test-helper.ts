import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { AccessContext } from '@academyops/contracts';
import type { PrismaService } from '../../src/platform/database/prisma.service';
import { CertificateReadService } from '../../src/certificates/certificate-read.service';
import { CertificateAccessService } from '../../src/certificates/certificate-access.service';
import { CertificateEligibilityService } from '../../src/certificates/certificate-eligibility.service';
import { CertificateRulesService } from '../../src/certificates/certificate-rules.service';
import { CertificateTokenService } from '../../src/certificates/certificate-token.service';
import { FileStorageService } from '../../src/platform/files/file-storage.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { CertificatesService } from '../../src/certificates/certificates.service';
import { CertificateIssueService } from '../../src/certificates/certificate-issue.service';
import { CertificateRevocationService } from '../../src/certificates/certificate-revocation.service';
import { CertificateFulfillmentService } from '../../src/certificates/certificate-fulfillment.service';

export interface TestFixture {
  orgA: { id: string };
  branchA: { id: string };
  versionA: { id: string };
  cohortA: { id: string };
  studentAUser: { id: string };
  adapter: PrismaService;
}

export function setupCertServices(fx: TestFixture) {
  const config = new ConfigService({
    WEB_ORIGIN: 'https://test.com',
    FILE_SIGNING_SECRET: 'test-file-signing-secret-at-least-32-chars',
  });
  const fileStorage = new FileStorageService(config, fx.adapter);
  const tokens = new CertificateTokenService(config);
  const certRules = new CertificateRulesService(fx.adapter);
  const certEligibility = new CertificateEligibilityService(certRules);
  const certAccess = new CertificateAccessService();
  const certRead = new CertificateReadService(
    fx.adapter,
    certAccess,
    certEligibility,
    tokens,
    fileStorage,
  );

  const audit = new AuditService();
  const outbox = new OutboxService();
  const idempotency = new IdempotencyService(fx.adapter);

  const issueService = new CertificateIssueService(
    fx.adapter,
    audit,
    idempotency,
    certAccess,
    certEligibility,
    tokens,
  );
  const revocationService = new CertificateRevocationService(
    fx.adapter,
    audit,
    outbox,
    idempotency,
    certAccess,
  );
  const fulfillmentService = new CertificateFulfillmentService(
    fx.adapter,
    audit,
    idempotency,
    certAccess,
    certEligibility,
  );
  const certsService = new CertificatesService(
    fx.adapter,
    certEligibility,
    tokens,
    issueService,
    revocationService,
    fulfillmentService,
    certAccess,
  );

  return {
    certRead,
    certsService,
    certAccess,
    tokens,
  };
}

export async function createTestEnrollment(
  transaction: Prisma.TransactionClient,
  fx: TestFixture,
  state: 'ACTIVE' | 'COMPLETED',
) {
  const person = await transaction.person.create({
    data: {
      organizationId: fx.orgA.id,
      publicId: `STU-REG-${randomUUID().slice(0, 8)}`,
      name: 'Student Regression',
    },
  });
  const user = await transaction.user.create({
    data: { organizationId: fx.orgA.id, personId: person.id, status: 'ACTIVE' },
  });
  await transaction.studentProfile.create({
    data: { organizationId: fx.orgA.id, personId: person.id },
  });
  const billing = await transaction.billingAccount.create({
    data: { organizationId: fx.orgA.id, kind: 'INDIVIDUAL', personId: person.id },
  });
  const enrollment = await transaction.enrollment.create({
    data: {
      organizationId: fx.orgA.id,
      studentPersonId: person.id,
      programVersionId: fx.versionA.id,
      billingAccountId: billing.id,
      homeBranchId: fx.branchA.id,
      state,
    },
  });
  await transaction.enrollmentCohortAssignment.create({
    data: {
      organizationId: fx.orgA.id,
      enrollmentId: enrollment.id,
      cohortId: fx.cohortA.id,
      startsAt: new Date('2026-01-01'),
      createdBy: user.id,
    },
  });

  const access: AccessContext = {
    organizationId: fx.orgA.id,
    actorUserId: user.id,
    grants: new Map([
      ['finance.balance.read', new Set(['S'])],
      ['certificates.read', new Set(['S'])],
      ['certificates.issue', new Set(['S'])],
    ]),
    branchIds: new Set([fx.branchA.id]),
    assignedResourceIds: new Set(),
    studentPersonId: person.id,
  };

  return { enrollment, user, billing, access };
}

export async function setAttendance(
  transaction: Prisma.TransactionClient,
  fx: TestFixture,
  sessions: Array<{ id: string }>,
  enrollmentId: string,
  userId: string,
  presentCount: number,
) {
  await transaction.attendanceRecord.createMany({
    data: sessions.map(({ id: sessionId }, index) => ({
      organizationId: fx.orgA.id,
      enrollmentId,
      sessionId,
      currentStatus: index < presentCount ? 'PRESENT' : 'ABSENT',
      version: 1,
      source: 'MANUAL',
      recordedAt: new Date(),
      recordedBy: userId,
    })),
  });
}

export async function setupFinance(
  transaction: Prisma.TransactionClient,
  fx: TestFixture,
  enrollmentId: string,
  userId: string,
  billingId: string,
  payOff: boolean,
) {
  let agreement = await transaction.pricingAgreement.create({
    data: {
      organizationId: fx.orgA.id,
      enrollmentId,
      version: 1,
      status: 'DRAFT',
      subtotal: '200.00',
      totalAmount: '200.00',
      proposedBy: userId,
    },
  });

  await transaction.pricingAgreementLine.create({
    data: {
      organizationId: fx.orgA.id,
      pricingAgreementId: agreement.id,
      type: 'TUITION',
      descriptionAr: 'Tuition',
      descriptionEn: 'Tuition',
      quantity: '1.00',
      unitAmount: '200.00',
      lineAmount: '200.00',
    },
  });

  agreement = await transaction.pricingAgreement.update({
    where: { id: agreement.id },
    data: { status: 'PROPOSED', lockVersion: { increment: 1 } },
  });

  agreement = await transaction.pricingAgreement.update({
    where: { id: agreement.id },
    data: {
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
      lockVersion: { increment: 1 },
    },
  });

  const schedule = await transaction.installmentSchedule.create({
    data: {
      organizationId: fx.orgA.id,
      enrollmentId,
      pricingAgreementId: agreement.id,
      version: 1,
      status: 'DRAFT',
    },
  });

  const inst = await transaction.installment.create({
    data: {
      organizationId: fx.orgA.id,
      scheduleId: schedule.id,
      ordinal: 1,
      dueDate: new Date('2026-01-01'),
      amount: '200.00',
    },
  });

  await transaction.installmentSchedule.update({
    where: { id: schedule.id },
    data: {
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
      lockVersion: { increment: 1 },
    },
  });

  const debit = await transaction.ledgerEntry.create({
    data: {
      organizationId: fx.orgA.id,
      billingAccountId: billingId,
      enrollmentId,
      direction: 'DEBIT',
      entryType: 'INSTALLMENT',
      amount: '200.00',
      sourceType: 'INSTALLMENT',
      sourceId: inst.id,
    },
  });

  await transaction.installment.update({
    where: { id: inst.id },
    data: { debitEntryId: debit.id },
  });

  if (payOff) {
    const credit = await transaction.ledgerEntry.create({
      data: {
        organizationId: fx.orgA.id,
        billingAccountId: billingId,
        enrollmentId,
        direction: 'CREDIT',
        entryType: 'PAYMENT',
        amount: '200.00',
        sourceType: 'PAYMENT',
        sourceId: randomUUID(),
      },
    });

    await transaction.ledgerAllocation.create({
      data: {
        organizationId: fx.orgA.id,
        creditEntryId: credit.id,
        debitEntryId: debit.id,
        amount: '200.00',
        createdBy: userId,
      },
    });
  }
}
