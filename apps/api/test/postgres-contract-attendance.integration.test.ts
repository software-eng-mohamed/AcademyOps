import type { AccessContext } from '@academyops/contracts';
import { afterAll, expect, it } from 'vitest';
import { AttendanceAccessService } from '../src/attendance/attendance-access.service';
import { setupAttendanceContractFixture } from './postgres-contract-attendance-helpers';
import { createTestHarness } from './postgres/harness';

const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();

databaseDescribe('PostgreSQL contract - Attendance', () => {
  afterAll(async () => prisma.$disconnect());

  it('enforces attendance roster, event, policy, anomaly, and makeup invariants', async () => {
    await inRollbackTransaction(async (transaction) => {
      const {
        organization,
        branch,
        student,
        user,
        version,
        session,
        secondSession,
        enrollment,
        otherEnrollment,
      } = await setupAttendanceContractFixture(transaction);

      const attendanceAccess = new AttendanceAccessService();
      const branchAccess = {
        organizationId: organization.id,
        actorUserId: user.id,
        grants: new Map([['attendance.read', new Set(['B'])]]),
        branchIds: new Set([branch.id]),
        assignedResourceIds: new Set<string>(),
      } as AccessContext;
      const deniedBranchAccess = {
        ...branchAccess,
        branchIds: new Set<string>(),
      } as AccessContext;
      const studentAccess = {
        organizationId: organization.id,
        actorUserId: user.id,
        grants: new Map([['attendance.read', new Set(['S'])]]),
        branchIds: new Set<string>(),
        assignedResourceIds: new Set<string>(),
        studentPersonId: student.id,
      } as AccessContext;
      await expect(
        attendanceAccess.assertSession(transaction, branchAccess, 'attendance.read', session.id),
      ).resolves.toMatchObject({ id: session.id });
      await expect(
        attendanceAccess.assertSession(
          transaction,
          deniedBranchAccess,
          'attendance.read',
          session.id,
        ),
      ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_RESOURCE_NOT_FOUND' } });
      await expect(
        attendanceAccess.assertSession(transaction, studentAccess, 'attendance.read', session.id),
      ).resolves.toMatchObject({ id: session.id });

      await expectDatabaseRejection(transaction, () =>
        transaction.attendanceRecord.create({
          data: {
            organizationId: organization.id,
            sessionId: session.id,
            enrollmentId: otherEnrollment.id,
            currentStatus: 'PRESENT',
            source: 'MANUAL',
            recordedAt: new Date(),
            recordedBy: user.id,
          },
        }),
      );

      const record = await transaction.attendanceRecord.create({
        data: {
          organizationId: organization.id,
          sessionId: session.id,
          enrollmentId: enrollment.id,
          currentStatus: 'PRESENT',
          source: 'MANUAL',
          recordedAt: new Date(),
          recordedBy: user.id,
        },
      });
      await transaction.attendanceEvent.create({
        data: {
          organizationId: organization.id,
          attendanceRecordId: record.id,
          version: 1,
          fromStatus: 'UNMARKED',
          toStatus: 'PRESENT',
          reason: 'TEST',
          actorUserId: user.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.attendanceRecord.update({
          where: { id: record.id },
          data: { currentStatus: 'ABSENT' },
        }),
      );

      const secondRecord = await transaction.attendanceRecord.create({
        data: {
          organizationId: organization.id,
          sessionId: secondSession.id,
          enrollmentId: enrollment.id,
          currentStatus: 'PRESENT',
          source: 'MANUAL',
          recordedAt: new Date(),
          recordedBy: user.id,
        },
      });
      await transaction.attendanceEvent.create({
        data: {
          organizationId: organization.id,
          attendanceRecordId: secondRecord.id,
          version: 1,
          fromStatus: 'UNMARKED',
          toStatus: 'PRESENT',
          reason: 'TEST',
          actorUserId: user.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.makeupCredit.create({
          data: {
            organizationId: organization.id,
            missedRecordId: record.id,
            makeupRecordId: secondRecord.id,
            approvedBy: user.id,
          },
        }),
      );

      const firstPolicy = await transaction.attendancePolicyVersion.create({
        data: {
          organizationId: organization.id,
          programVersionId: version.id,
          version: 1,
          minimumRatio: '0.8000',
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: new Date('2026-06-01T00:00:00Z'),
          createdBy: user.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.attendancePolicyVersion.create({
          data: {
            organizationId: organization.id,
            programVersionId: version.id,
            version: 2,
            minimumRatio: '0.8000',
            effectiveFrom: new Date('2026-05-01T00:00:00Z'),
            effectiveTo: new Date('2026-07-01T00:00:00Z'),
            createdBy: user.id,
          },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.attendancePolicyVersion.update({
          where: { id: firstPolicy.id },
          data: { minimumRatio: '0.9000' },
        }),
      );

      const anomaly = await transaction.attendanceAnomaly.create({
        data: {
          organizationId: organization.id,
          actorUserId: user.id,
          studentPersonId: student.id,
          reasonCode: 'MALFORMED_TOKEN',
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.attendanceAnomaly.update({
          where: { id: anomaly.id },
          data: { reasonCode: 'NOT_IN_ROSTER' },
        }),
      );

      await transaction.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    });
  });
});
