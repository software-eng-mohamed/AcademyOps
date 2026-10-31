import type { Prisma } from '@prisma/client';
import type { AccessContext, AccessScope, PermissionCode } from '@academyops/contracts';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AcademicService } from '../src/academic/academic.service';
import { CatalogAccessService } from '../src/academic/catalog-access.service';
import { EnrollmentQueryService } from '../src/enrollment/enrollment-query.service';
import { FinanceAccessService } from '../src/finance/finance-access.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { WorkspaceOverviewService } from '../src/reporting/workspace-overview.service';
import { WorkspacePaymentsService } from '../src/reporting/workspace-payments.service';
import { StudentOverviewService } from '../src/reporting/student-overview.service';
import { StudentOverviewFinanceService } from '../src/reporting/student-overview-finance.service';
import { WorkspaceInsightsService } from '../src/reporting/workspace-insights.service';
import { WorkspaceBusinessInsightsService } from '../src/reporting/workspace-business-insights.service';
import { WorkspaceLearningInsightsService } from '../src/reporting/workspace-learning-insights.service';
import { setupAcademicSessionFixture } from './postgres/academic-session-test.helper';
import { setupStudentSelfServiceFixture } from './postgres/student-self-service-fixture';
import { createTestHarness } from './postgres/harness';

const { prisma, databaseDescribe, inRollbackTransaction } = createTestHarness();
const now = new Date('2026-09-02T09:00:00Z');
function service(tx: Prisma.TransactionClient) {
  const db = tx as PrismaService;
  return new WorkspaceOverviewService(
    db,
    new AcademicService(db),
    new CatalogAccessService(db),
    new EnrollmentQueryService(db),
    new WorkspacePaymentsService(db, new FinanceAccessService()),
    { read: vi.fn() } as never,
    new StudentOverviewService(
      {
        $transaction: (fn: (transaction: Prisma.TransactionClient) => Promise<unknown>) => fn(tx),
      } as PrismaService,
      new StudentOverviewFinanceService(),
    ),
    new WorkspaceInsightsService(
      new WorkspaceBusinessInsightsService(
        db,
        new EnrollmentQueryService(db),
        new FinanceAccessService(),
      ),
      new WorkspaceLearningInsightsService(db, new CatalogAccessService(db)),
    ),
  );
}
function access(
  organizationId: string,
  actorUserId: string,
  scope: AccessScope,
  branches: string[] = [],
): AccessContext {
  const permissions: PermissionCode[] = [
    'academic.catalog.read',
    'enrollments.read',
    'attendance.read',
    'payments.read',
  ];
  return {
    organizationId,
    actorUserId,
    branchIds: new Set(branches),
    assignedResourceIds: new Set(),
    grants: new Map(permissions.map((code) => [code, new Set([scope])])),
  };
}
databaseDescribe('Workspace overview PostgreSQL scope and counts (rollback)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => prisma.$disconnect());
  it('counts all today sessions but returns six, excludes cancelled/draft and scopes branches', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupAcademicSessionFixture(tx);
      for (let i = 0; i < 10; i++) {
        await tx.session.create({
          data: {
            organizationId: f.org.id,
            cohortId: f.cohort.id,
            cohortModuleId: f.cohortModule.id,
            ordinal: i + 1,
            startsAt: new Date(`2026-09-02T${String(10 + i).padStart(2, '0')}:00:00Z`),
            endsAt: new Date(`2026-09-02T${String(10 + i).padStart(2, '0')}:30:00Z`),
            deliveryMode: 'ONLINE',
            status: i === 8 ? 'CANCELLED' : i === 9 ? 'DRAFT' : 'SCHEDULED',
          },
        });
      }
      const svc = service(tx);
      const result = await svc.overview(
        access(f.org.id, f.ownerAccess.actorUserId, 'B', [f.branch.id]),
        'ATTENDANCE',
      );
      expect(result.metrics.find((item) => item.key === 'sessionsToday')?.value).toBe(8);
      expect(result.queue?.total).toBe(8);
      expect(result.queue?.items).toHaveLength(6);
      expect(result.queue?.items[0]?.at).toBe('2026-09-02T10:00:00.000Z');
      const other = await svc.overview(
        access(f.org.id, f.ownerAccess.actorUserId, 'B', [f.otherBranch.id]),
        'ATTENDANCE',
      );
      expect(other.queue?.total).toBe(0);
      const mixed = access(f.org.id, f.ownerAccess.actorUserId, 'O', [f.otherBranch.id]);
      mixed.grants = new Map([...mixed.grants, ['attendance.read', new Set(['B'])]]);
      const restricted = await svc.overview(mixed, 'ATTENDANCE');
      expect(restricted.queue?.total).toBe(0);
      expect(restricted.staff?.kind === 'ATTENDANCE' && restricted.staff.recordsToday).toEqual([]);
      const none = await svc.overview(
        access(f.org.id, f.ownerAccess.actorUserId, 'B'),
        'ATTENDANCE',
      );
      expect(none.queue?.total).toBe(0);
      const foreign = await svc.overview(
        access(f.foreignTrainer.organizationId, f.foreignTrainer.id, 'O'),
        'ACADEMIC',
      );
      expect(foreign.queue?.total).toBe(0);
    });
  });
  it('shows only confirmed assignments for the active trainer, never a colleague’s sessions', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupAcademicSessionFixture(tx);
      const trainerUser = await tx.user.create({
        data: { organizationId: f.org.id, personId: f.trainer.personId },
      });
      const own = await tx.session.create({
        data: {
          organizationId: f.org.id,
          cohortId: f.cohort.id,
          cohortModuleId: f.cohortModule.id,
          ordinal: 1,
          startsAt: new Date('2026-09-02T10:00:00Z'),
          endsAt: new Date('2026-09-02T11:00:00Z'),
          deliveryMode: 'ONLINE',
          status: 'SCHEDULED',
        },
      });
      const other = await tx.session.create({
        data: {
          organizationId: f.org.id,
          cohortId: f.cohort.id,
          cohortModuleId: f.cohortModule.id,
          ordinal: 2,
          startsAt: new Date('2026-09-02T12:00:00Z'),
          endsAt: new Date('2026-09-02T13:00:00Z'),
          deliveryMode: 'ONLINE',
          status: 'SCHEDULED',
        },
      });
      await tx.sessionTrainer.createMany({
        data: [
          {
            organizationId: f.org.id,
            sessionId: own.id,
            trainerId: f.trainer.id,
            startsAt: own.startsAt,
            endsAt: own.endsAt,
          },
          {
            organizationId: f.org.id,
            sessionId: other.id,
            trainerId: f.replacementTrainer.id,
            startsAt: other.startsAt,
            endsAt: other.endsAt,
          },
        ],
      });
      const ctx = access(f.org.id, trainerUser.id, 'A');
      ctx.grants = new Map([...ctx.grants, ['academic.catalog.read', new Set(['A', 'O'])]]);
      const trainerResult = await service(tx).overview(ctx, 'TRAINER');
      expect(trainerResult.queue?.items.map((item) => item.id)).toEqual([own.id]);
      expect(trainerResult.staff?.kind).toBe('TRAINER');
      if (trainerResult.staff?.kind !== 'TRAINER') throw new Error('Wrong projection');
      expect(trainerResult.staff.nextSession?.id).toBe(own.id);
      expect(trainerResult.staff.days[0]).toMatchObject({ sessions: 1, minutes: 60 });
      await tx.trainerProfile.update({ where: { id: f.trainer.id }, data: { status: 'INACTIVE' } });
      expect((await service(tx).overview(ctx, 'TRAINER')).queue?.total).toBe(0);
    });
  });
  it('keeps student sessions within assignment dates and financial data outside the student overview', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupStudentSelfServiceFixture(tx);
      await tx.enrollmentCohortAssignment.updateMany({
        where: { enrollmentId: f.enrollmentA.id },
        data: {
          endsAt: new Date('2026-09-02T00:00:00Z'),
        },
      });
      await tx.enrollmentCohortAssignment.create({
        data: {
          organizationId: f.orgA.id,
          enrollmentId: f.enrollmentA.id,
          cohortId: f.cohortA.id,
          startsAt: new Date('2026-09-03T00:00:00Z'),
          endsAt: new Date('2026-09-04T00:00:00Z'),
          createdBy: f.studentAUser.id,
        },
      });
      const cm = await tx.cohortModule.create({
        data: {
          organizationId: f.orgA.id,
          cohortId: f.cohortA.id,
          programVersionModuleId: f.pvmA.id,
          ordinal: 1,
        },
      });
      const ids: string[] = [];
      for (let day = 2; day < 5; day++)
        ids.push(
          (
            await tx.session.create({
              data: {
                organizationId: f.orgA.id,
                cohortId: f.cohortA.id,
                cohortModuleId: cm.id,
                ordinal: day,
                startsAt: new Date(`2026-09-0${day}T10:00:00Z`),
                endsAt: new Date(`2026-09-0${day}T11:00:00Z`),
                deliveryMode: 'ONLINE',
                status: 'SCHEDULED',
              },
            })
          ).id,
        );
      const ctx = { ...access(f.orgA.id, f.studentAUser.id, 'S'), studentPersonId: f.personA.id };
      const result = await service(tx).overview(ctx, 'STUDENT');
      expect(result.queue?.items.map((item) => item.id)).toEqual([ids[1]]);
      expect(result.metrics.find((item) => item.key === 'sessionsNext7Days')?.value).toBe(1);
      expect(result.queue?.items.every((item) => item.amount === null)).toBe(true);
      const other = await service(tx).overview(
        { ...ctx, actorUserId: f.studentBUser.id, studentPersonId: f.personB.id },
        'STUDENT',
      );
      expect(other.queue?.items).toHaveLength(3);
      const noProfile = await service(tx).overview(
        access(f.orgA.id, f.studentAUser.id, 'S'),
        'STUDENT',
      );
      expect(noProfile.queue?.total).toBe(0);
    });
  });

  it('keeps payment previews bounded, exact to the cent and scoped to visible billing accounts', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupStudentSelfServiceFixture(tx);
      const method = await tx.paymentMethod.create({
        data: { organizationId: f.orgA.id, code: 'CASH', name: 'Cash' },
      });
      for (let i = 0; i < 9; i++) {
        await tx.payment.create({
          data: {
            organizationId: f.orgA.id,
            billingAccountId: f.billingA.id,
            enrollmentId: f.enrollmentA.id,
            methodId: method.id,
            status: 'PENDING_VERIFICATION',
            amount: '125.55',
            idempotencyKey: `workspace-payment-${i}`,
            receivedAt:
              i === 8 ? new Date('2026-08-31T20:59:59Z') : new Date('2026-09-02T08:00:00Z'),
            createdBy: f.studentAUser.id,
          },
        });
      }
      const result = await service(tx).overview(
        access(f.orgA.id, f.studentAUser.id, 'B', [f.branchA.id]),
        'ACCOUNTS',
      );
      expect(result.queue?.total).toBe(8);
      expect(result.queue?.items).toHaveLength(6);
      expect(
        result.queue?.items.every((item) => item.amount === '125.55' && item.title === 'Cash'),
      ).toBe(true);
      // Pending verification is not a posted payment.
      expect(result.metrics.every((item) => item.value === 0)).toBe(true);
      expect(
        (await service(tx).overview(access(f.orgA.id, f.studentAUser.id, 'B'), 'ACCOUNTS')).queue
          ?.total,
      ).toBe(0);
      expect(
        (await service(tx).overview(access(f.orgB.id, f.studentCUser.id, 'O'), 'ACCOUNTS')).queue
          ?.total,
      ).toBe(0);
    });
  });
});
