import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './harness';
import { setup } from './pricing-activation.fixture';

const harness = createTestHarness();
const input = {
  lines: [
    {
      type: 'TUITION',
      descriptionAr: 'Tuition',
      descriptionEn: 'Tuition',
      quantity: '1',
      unitAmount: '200',
    },
  ],
};
const scheduleInput = { installments: [{ dueDate: '2026-09-01', amount: '200' }] };

async function expectGuard(
  tx: Parameters<typeof setup>[0],
  message: string,
  work: () => Promise<unknown>,
) {
  await tx.$executeRawUnsafe('SAVEPOINT expected_pricing_guard');
  try {
    await expect(work()).rejects.toThrow(message);
  } finally {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT expected_pricing_guard');
  }
}

harness.databaseDescribe('Pricing is frozen when enrollment is activated', () => {
  afterAll(() => harness.prisma.$disconnect());

  it('rejects stale pricing and schedule writes, preserves current finance and allows replay/rejection', () =>
    harness.inRollbackTransaction(async (tx) => {
      const fx = await setup(tx);
      const { access, agreements, approvals, schedules } = fx;
      const createKey = randomUUID();
      const draftInput = { enrollmentId: fx.enrollmentA.id, ...input };
      const stale = await agreements.create(access, draftInput, createKey, randomUUID());
      const proposed = await agreements.submit(
        access,
        stale.id,
        stale.lockVersion,
        randomUUID(),
        randomUUID(),
      );
      const draft = await agreements.create(access, draftInput, randomUUID(), randomUUID());
      const pendingSchedule = await schedules.createSchedule(
        access,
        fx.agreement.id,
        scheduleInput,
        randomUUID(),
        randomUUID(),
      );
      await tx.enrollment.update({ where: { id: fx.enrollmentA.id }, data: { state: 'ACTIVE' } });

      const locked = { response: { code: 'ENROLLMENT_PRICING_LOCKED' } };
      await expect(
        approvals.approve(
          access,
          stale.id,
          'obsolete',
          proposed.lockVersion,
          randomUUID(),
          randomUUID(),
        ),
      ).rejects.toMatchObject(locked);
      await expect(
        agreements.create(access, draftInput, randomUUID(), randomUUID()),
      ).rejects.toMatchObject(locked);
      await expect(
        agreements.update(access, draft.id, input, draft.lockVersion, randomUUID(), randomUUID()),
      ).rejects.toMatchObject(locked);
      await expect(
        agreements.submit(access, draft.id, draft.lockVersion, randomUUID(), randomUUID()),
      ).rejects.toMatchObject(locked);
      await expect(
        schedules.createSchedule(
          access,
          fx.agreement.id,
          scheduleInput,
          randomUUID(),
          randomUUID(),
        ),
      ).rejects.toMatchObject(locked);
      await expect(
        schedules.updateSchedule(
          access,
          pendingSchedule.id,
          scheduleInput,
          pendingSchedule.lockVersion,
          randomUUID(),
          randomUUID(),
        ),
      ).rejects.toMatchObject(locked);
      await expect(
        schedules.approveSchedule(
          access,
          pendingSchedule.id,
          pendingSchedule.lockVersion,
          randomUUID(),
          randomUUID(),
        ),
      ).rejects.toMatchObject(locked);

      await expect(agreements.create(access, draftInput, createKey, randomUUID())).resolves.toEqual(
        stale,
      );
      await expect(
        approvals.approve(
          access,
          fx.agreement.id,
          'already approved',
          1,
          randomUUID(),
          randomUUID(),
        ),
      ).resolves.toMatchObject({ status: 'APPROVED' });
      await expect(
        schedules.approveSchedule(access, fx.schedule.id, 1, randomUUID(), randomUUID()),
      ).resolves.toMatchObject({ status: 'APPROVED' });
      await expect(
        agreements.reject(
          access,
          proposed.id,
          'obsolete',
          proposed.lockVersion,
          randomUUID(),
          randomUUID(),
        ),
      ).resolves.toMatchObject({ status: 'REJECTED' });
      expect(
        await tx.pricingAgreement.findUnique({ where: { id: fx.agreement.id } }),
      ).toMatchObject({ status: 'APPROVED' });
      expect(await tx.installment.findMany({ where: { scheduleId: fx.schedule.id } })).toHaveLength(
        2,
      );
      expect(await tx.ledgerEntry.count({ where: { enrollmentId: fx.enrollmentA.id } })).toBe(3);
    }));

  it('keeps pricing approval and schedule creation available while pending', () =>
    harness.inRollbackTransaction(async (tx) => {
      const fx = await setup(tx);
      await tx.enrollment.update({
        where: { id: fx.enrollmentA.id },
        data: { state: 'PENDING_APPROVAL' },
      });
      const draft = await fx.agreements.create(
        fx.access,
        { enrollmentId: fx.enrollmentA.id, ...input },
        randomUUID(),
        randomUUID(),
      );
      const proposed = await fx.agreements.submit(
        fx.access,
        draft.id,
        draft.lockVersion,
        randomUUID(),
        randomUUID(),
      );
      const approved = await fx.approvals.approve(
        fx.access,
        draft.id,
        'corrected quote',
        proposed.lockVersion,
        randomUUID(),
        randomUUID(),
      );
      expect(approved.status).toBe('APPROVED');
      const schedule = await fx.schedules.createSchedule(
        fx.access,
        approved.id,
        scheduleInput,
        randomUUID(),
        randomUUID(),
      );
      await expect(
        fx.schedules.approveSchedule(
          fx.access,
          schedule.id,
          schedule.lockVersion,
          randomUUID(),
          randomUUID(),
        ),
      ).resolves.toMatchObject({ status: 'APPROVED' });
    }));

  it('database rejects direct supersession and replacement after activation, but permits initial historical finance', () =>
    harness.inRollbackTransaction(async (tx) => {
      const fx = await setup(tx);
      const draft = await fx.agreements.create(
        fx.access,
        { enrollmentId: fx.enrollmentA.id, ...input },
        randomUUID(),
        randomUUID(),
      );
      await fx.agreements.submit(
        fx.access,
        draft.id,
        draft.lockVersion,
        randomUUID(),
        randomUUID(),
      );
      const schedule = await fx.schedules.createSchedule(
        fx.access,
        fx.agreement.id,
        scheduleInput,
        randomUUID(),
        randomUUID(),
      );
      await tx.enrollment.update({ where: { id: fx.enrollmentA.id }, data: { state: 'ACTIVE' } });
      await expectGuard(tx, 'enrollment pricing is locked after activation', () =>
        tx.pricingAgreement.update({
          where: { id: fx.agreement.id },
          data: { status: 'SUPERSEDED' },
        }),
      );
      await expectGuard(tx, 'enrollment pricing is locked after activation', () =>
        tx.pricingAgreement.update({
          where: { id: draft.id },
          data: { status: 'APPROVED', approvedBy: fx.studentAUser.id, approvedAt: new Date() },
        }),
      );
      await expectGuard(tx, 'installment schedule is locked after activation', () =>
        tx.installmentSchedule.update({
          where: { id: schedule.id },
          data: { status: 'APPROVED', approvedBy: fx.studentAUser.id, approvedAt: new Date() },
        }),
      );
      await tx.enrollment.update({ where: { id: fx.enrollmentB.id }, data: { state: 'ACTIVE' } });
      const historical = await tx.pricingAgreement.create({
        data: {
          organizationId: fx.orgA.id,
          enrollmentId: fx.enrollmentB.id,
          version: 1,
          subtotal: '200',
          totalAmount: '200',
          proposedBy: fx.studentAUser.id,
        },
      });
      await tx.pricingAgreementLine.create({
        data: {
          organizationId: fx.orgA.id,
          pricingAgreementId: historical.id,
          ...input.lines[0]!,
          lineAmount: '200',
        },
      });
      await tx.pricingAgreement.update({
        where: { id: historical.id },
        data: { status: 'PROPOSED' },
      });
      await tx.pricingAgreement.update({
        where: { id: historical.id },
        data: {
          status: 'APPROVED',
          approvedBy: fx.studentAUser.id,
          approvedAt: new Date(),
        },
      });
      const historicalSchedule = await tx.installmentSchedule.create({
        data: {
          organizationId: fx.orgA.id,
          enrollmentId: fx.enrollmentB.id,
          pricingAgreementId: historical.id,
          version: 1,
        },
      });
      await tx.installment.create({
        data: {
          organizationId: fx.orgA.id,
          scheduleId: historicalSchedule.id,
          ordinal: 1,
          amount: '200',
          dueDate: new Date('2026-09-01'),
        },
      });
      await tx.installmentSchedule.update({
        where: { id: historicalSchedule.id },
        data: {
          status: 'APPROVED',
          approvedBy: fx.studentAUser.id,
          approvedAt: new Date(),
        },
      });
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    }));
});
