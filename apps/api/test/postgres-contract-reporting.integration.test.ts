import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract - Reporting', () => {
  afterAll(async () => prisma.$disconnect());
  it('enforces report export ownership, lifecycle, file state, and immutability', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `REPORT-${randomUUID()}`, name: 'Reports' },
      });
      const person = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `REPORT-USER-${randomUUID().slice(0, 12)}`,
          name: 'Report User',
        },
      });
      const user = await transaction.user.create({
        data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
      });
      const job = await transaction.reportExportJob.create({
        data: {
          organizationId: organization.id,
          requestedBy: user.id,
          reportType: 'FINANCE_RECEIVABLES',
          parameters: { asOf: '2026-08-09' },
          scopeSnapshot: { enrollmentIds: [] },
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.reportExportJob.update({
          where: { id: job.id },
          data: { status: 'RUNNING', startedAt: new Date() },
        }),
      );
      const running = await transaction.reportExportJob.update({
        where: { id: job.id },
        data: { status: 'RUNNING', startedAt: new Date(), version: { increment: 1 } },
      });
      expect(running).toMatchObject({ status: 'RUNNING', version: 2 });
      const asset = await transaction.fileAsset.create({
        data: {
          organizationId: organization.id,
          storageKey: `reports/${job.id}/report.csv`,
          contentType: 'text/csv; charset=utf-8',
          sizeBytes: 10,
          sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          classification: 'PRIVATE',
          scanStatus: 'CLEAN',
          createdBy: user.id,
        },
      });
      const available = await transaction.reportExportJob.update({
        where: { id: job.id },
        data: {
          status: 'AVAILABLE',
          fileAssetId: asset.id,
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      expect(available).toMatchObject({ status: 'AVAILABLE', version: 3 });
      await expectDatabaseRejection(transaction, () =>
        transaction.reportExportJob.delete({ where: { id: job.id } }),
      );
    });
  });
});
