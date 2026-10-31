import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { setupCertificateContractFixture } from './postgres-contract-certificate-helpers';
import { createTestHarness } from './postgres/harness';

const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();

databaseDescribe('PostgreSQL contract - Certificate', () => {
  afterAll(async () => prisma.$disconnect());

  it('hard-gates certificate issue at 80 percent attendance and zero outstanding balance', async () => {
    await inRollbackTransaction(async (transaction) => {
      const { organization, user, billing, version, cohort, cohortModule, enrollment } =
        await setupCertificateContractFixture(transaction);

      for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
        const session = await transaction.session.create({
          data: {
            organizationId: organization.id,
            cohortModuleId: cohortModule.id,
            cohortId: cohort.id,
            ordinal,
            startsAt: new Date(`2026-08-0${ordinal}T10:00:00Z`),
            endsAt: new Date(`2026-08-0${ordinal}T12:00:00Z`),
            deliveryMode: 'IN_PERSON',
            status: 'SCHEDULED',
            attendanceWindowState: 'LOCKED',
            attendanceLockedAt: new Date(`2026-08-0${ordinal}T13:00:00Z`),
          },
        });
        const status = ordinal <= 4 ? 'PRESENT' : 'ABSENT';
        const record = await transaction.attendanceRecord.create({
          data: {
            organizationId: organization.id,
            sessionId: session.id,
            enrollmentId: enrollment.id,
            currentStatus: status,
            source: 'MANUAL',
            recordedAt: new Date(`2026-08-0${ordinal}T12:00:00Z`),
            recordedBy: user.id,
          },
        });
        await transaction.attendanceEvent.create({
          data: {
            organizationId: organization.id,
            attendanceRecordId: record.id,
            version: 1,
            fromStatus: 'UNMARKED',
            toStatus: status,
            reason: 'CERTIFICATE_GATE_TEST',
            actorUserId: user.id,
          },
        });
      }

      const rule = await transaction.certificateRuleVersion.create({
        data: {
          organizationId: organization.id,
          programVersionId: version.id,
          cohortId: cohort.id,
          version: 1,
          minimumRatio: '0.8000',
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          createdBy: user.id,
        },
      });
      const debit = await transaction.ledgerEntry.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          enrollmentId: enrollment.id,
          direction: 'DEBIT',
          entryType: 'TUITION',
          amount: '100.00',
          sourceType: 'CERTIFICATE_TEST',
          sourceId: randomUUID(),
        },
      });
      const heldEvaluation = await transaction.eligibilityEvaluation.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          ruleVersionId: rule.id,
          attendanceRatio: '0.8000',
          academicResult: 'ELIGIBLE',
          financialHold: true,
          evidenceSnapshot: { test: true },
          evaluatedBy: user.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.certificate.create({
          data: {
            organizationId: organization.id,
            enrollmentId: enrollment.id,
            evaluationId: heldEvaluation.id,
            serial: `HELD-${randomUUID()}`,
            verificationDigest: randomUUID().replaceAll('-', '').padEnd(64, '0'),
            issuedBy: user.id,
          },
        }),
      );

      const credit = await transaction.ledgerEntry.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          enrollmentId: null,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          amount: '100.00',
          sourceType: 'CERTIFICATE_TEST',
          sourceId: randomUUID(),
        },
      });
      await transaction.ledgerAllocation.create({
        data: {
          organizationId: organization.id,
          creditEntryId: credit.id,
          debitEntryId: debit.id,
          amount: '100.00',
          createdBy: user.id,
        },
      });
      const eligibleEvaluation = await transaction.eligibilityEvaluation.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          ruleVersionId: rule.id,
          attendanceRatio: '0.8000',
          academicResult: 'ELIGIBLE',
          financialHold: false,
          evidenceSnapshot: { test: true },
          evaluatedBy: user.id,
        },
      });
      const certificate = await transaction.certificate.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          evaluationId: eligibleEvaluation.id,
          serial: `PASS-${randomUUID()}`,
          verificationDigest: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          issuedBy: user.id,
        },
      });
      const uploadedAsset = await transaction.fileAsset.create({
        data: {
          organizationId: organization.id,
          storageKey: `certificate-test/${certificate.id}/first.pdf`,
          contentType: 'application/pdf',
          sizeBytes: 100,
          sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          classification: 'PRIVATE',
          scanStatus: 'CLEAN',
          createdBy: user.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.certificate.update({
          where: { id: certificate.id },
          data: { pdfStatus: 'AVAILABLE', fileAssetId: uploadedAsset.id },
        }),
      );
      const availablePdf = await transaction.certificate.update({
        where: { id: certificate.id },
        data: {
          pdfStatus: 'AVAILABLE',
          fileAssetId: uploadedAsset.id,
          version: { increment: 1 },
        },
      });
      expect(availablePdf).toMatchObject({ pdfStatus: 'AVAILABLE', version: 2 });
      await transaction.certificateEvent.create({
        data: {
          organizationId: organization.id,
          certificateId: certificate.id,
          type: 'PDF_UPLOADED',
          fromValue: null,
          toValue: uploadedAsset.id,
          actorUserId: user.id,
        },
      });

      const printed = await transaction.certificate.update({
        where: { id: certificate.id },
        data: { fulfillmentStatus: 'PRINTED', version: { increment: 1 } },
      });
      expect(printed).toMatchObject({ fulfillmentStatus: 'PRINTED', version: 3 });
      const replacementAsset = await transaction.fileAsset.create({
        data: {
          organizationId: organization.id,
          storageKey: `certificate-test/${certificate.id}/replacement.pdf`,
          contentType: 'application/pdf',
          sizeBytes: 101,
          sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          classification: 'PRIVATE',
          scanStatus: 'CLEAN',
          createdBy: user.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.certificate.update({
          where: { id: certificate.id },
          data: { fileAssetId: replacementAsset.id, version: { increment: 1 } },
        }),
      );

      await transaction.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    });
  });
});
