import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { AccessContext } from '@academyops/contracts';
import { EnrollmentCancellationService } from '../../src/enrollment/enrollment-cancellation.service';
import { EnrollmentQueryService } from '../../src/enrollment/enrollment-query.service';
import { EnrollmentEventService } from '../../src/enrollment/enrollment-event.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { createTestHarness } from './harness';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';

const harness = createTestHarness();
harness.databaseDescribe('Cancellation decisions after enrollment changes', () => {
  afterAll(() => harness.prisma.$disconnect());
  it('rejects stale approval but lets a checker reject, audit and replace the obsolete request', () =>
    harness.inRollbackTransaction(async (tx) => {
      const fx = await setupStudentSelfServiceFixture(tx);
      const access: AccessContext = {
        organizationId: fx.orgA.id,
        actorUserId: fx.studentAUser.id,
        grants: new Map([
          ['enrollments.cancel.request', new Set(['O'])],
          ['enrollments.cancel.approve', new Set(['O'])],
        ]),
        branchIds: new Set(),
        assignedResourceIds: new Set(),
      };
      const checker = { ...access, actorUserId: fx.studentBUser.id };
      const audit = new AuditService(fx.adapter);
      const outbox = new OutboxService();
      const service = new EnrollmentCancellationService(
        fx.adapter,
        audit,
        outbox,
        new IdempotencyService(),
        new EnrollmentQueryService(fx.adapter),
        new EnrollmentEventService(audit, outbox),
      );
      await tx.enrollment.update({ where: { id: fx.enrollmentA.id }, data: { state: 'ACTIVE' } });
      const request = await service.requestCancellation(access, fx.enrollmentA.id, {
        expectedVersion: 1,
        reason: 'Incorrect enrollment',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      });
      await tx.enrollment.update({ where: { id: fx.enrollmentA.id }, data: { version: 2 } });
      await expect(
        service.decideCancellation(checker, request.id, 'APPROVED', 'Approve', {
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ response: { code: 'CANCELLATION_ENROLLMENT_CHANGED' } });
      await expect(
        service.decideCancellation(access, request.id, 'REJECTED', 'Withdraw', {
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ response: { code: 'MAKER_CHECKER_REQUIRED' } });
      const decisionMeta = { idempotencyKey: randomUUID(), correlationId: randomUUID() };
      const rejected = await service.decideCancellation(
        checker,
        request.id,
        'REJECTED',
        'Enrollment changed; request again',
        decisionMeta,
      );
      expect(rejected.status).toBe('REJECTED');
      await expect(
        service.decideCancellation(
          checker,
          request.id,
          'REJECTED',
          'Enrollment changed; request again',
          decisionMeta,
        ),
      ).resolves.toEqual(rejected);
      expect(await tx.enrollment.findUnique({ where: { id: fx.enrollmentA.id } })).toMatchObject({
        state: 'ACTIVE',
        version: 2,
      });
      const events = await tx.auditEvent.findMany({
        where: { entityId: request.id, action: 'enrollment.cancellation.reject' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.after).toMatchObject({
        requestedEnrollmentVersion: 1,
        currentEnrollmentVersion: 2,
        decisionReason: 'Enrollment changed; request again',
      });
      expect(
        await tx.outboxEvent.count({
          where: { aggregateId: request.id, type: 'enrollment.cancellation.rejected' },
        }),
      ).toBe(1);
      await expect(
        service.requestCancellation(access, fx.enrollmentA.id, {
          expectedVersion: 2,
          reason: 'Updated cancellation request',
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
        }),
      ).resolves.toMatchObject({ status: 'REQUESTED' });
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    }));
});
