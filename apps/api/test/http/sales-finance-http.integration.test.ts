import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runHttpScenario } from './http-test-harness';
import { get, patch, post, put } from './finance-http-client';
import { seedBusinessFixture } from './business-chain-fixture';
import { body, databaseDescribe, headers, sales } from './sales-http-support';

databaseDescribe('Sales lead conversion and fee boundaries over HTTP', () => {
  it('reports a domain conflict when archiving a company with ongoing enrollments', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'SALES' }, async (context) => {
      await sales(context);
      const fixture = await seedBusinessFixture(context);
      const company = await body<{ id: string; billingAccountId: string }>(
        await post(context, 'business-accounts', {
          owningBranchId: context.branchId,
          legalName: 'Ongoing company',
          displayName: 'Ongoing company',
        }),
        201,
      );
      await context.prisma.enrollment.create({
        data: {
          organizationId: context.organizationId,
          studentPersonId: fixture.studentPersonId,
          programVersionId: fixture.programVersionId,
          billingAccountId: company.billingAccountId,
          homeBranchId: context.branchId,
          state: 'DRAFT',
          kind: 'CORPORATE',
        },
      });
      expect(
        await body<{ code: string }>(
          await patch(
            context,
            `business-accounts/${company.id}`,
            { status: 'ARCHIVED' },
            headers(),
          ),
          409,
        ),
      ).toMatchObject({ code: 'BUSINESS_ACCOUNT_ACTIVE_ENROLLMENTS' });
    });
  }, 120_000);
  it('auto-assigns leads, follows their lifecycle and proposes pricing without reviewer authority', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'SALES' }, async (context) => {
      await sales(context);
      const fixture = await seedBusinessFixture(context);
      const lead = await body(
        await post(context, 'leads', {
          branchId: context.branchId,
          newPerson: { name: `Sales lead ${randomUUID()}` },
          source: 'Website',
          nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
        201,
      );
      expect(lead.assignedUserId).toBe(context.userId);
      await body(await get(context, `leads/${lead.id}`), 200);
      await body(
        await post(context, `leads/${lead.id}/activities`, {
          type: 'NOTE',
          data: { note: 'Synthetic follow-up' },
        }),
        201,
      );
      let version = lead.version;
      for (const action of [
        'open',
        'qualify',
        'lose',
        'reopen',
        'disqualify',
        'reopen',
        'qualify',
      ]) {
        version = (
          await body(
            await post(
              context,
              `leads/${lead.id}/${action}`,
              ['lose', 'reopen', 'disqualify'].includes(action)
                ? { reason: 'Synthetic sales follow-up' }
                : undefined,
              headers(version),
            ),
            201,
          )
        ).version;
      }
      const winInput = {
        programVersionId: fixture.programVersionId,
        homeBranchId: context.branchId,
        cohortId: fixture.cohortId,
        kind: 'INDIVIDUAL',
      };
      const winKey = headers(version);
      const won = await body(await post(context, `leads/${lead.id}/win`, winInput, winKey), 201);
      expect(
        await body(await post(context, `leads/${lead.id}/win`, winInput, winKey), 201),
      ).toEqual(won);
      const enrollmentId = won.enrollmentId;
      await body(await get(context, `enrollments/${enrollmentId}`), 200);
      const line = {
        type: 'TUITION',
        descriptionEn: 'Course fees',
        descriptionAr: 'رسوم الكورس',
        quantity: '1.00',
        unitAmount: '100.00',
      };
      const feeInput = { enrollmentId, discountAmount: '0.00', lines: [line] };
      const feeKey = headers();
      const fee = await body(await post(context, 'pricing-agreements', feeInput, feeKey), 201);
      expect(await body(await post(context, 'pricing-agreements', feeInput, feeKey), 201)).toEqual(
        fee,
      );
      const edited = await body(
        await put(
          context,
          `pricing-agreements/${fee.id}`,
          { discountAmount: '10.00', lines: [line] },
          headers(fee.lockVersion),
        ),
        200,
      );
      const proposed = await body(
        await post(
          context,
          `pricing-agreements/${fee.id}/submit`,
          undefined,
          headers(edited.lockVersion),
        ),
        201,
      );
      expect(proposed.status).toBe('PROPOSED');
      await body(await get(context, `pricing-agreements?enrollmentId=${enrollmentId}`), 200);
      for (const action of ['approve', 'reject'])
        await body(
          await post(
            context,
            `pricing-agreements/${fee.id}/${action}`,
            { reason: 'Sales may not approve' },
            headers(proposed.lockVersion),
          ),
          403,
        );
      // Reviewer approval is fixture setup, not an added Sales permission.
      await context.prisma.pricingAgreement.update({
        where: { id: fee.id },
        data: { status: 'APPROVED', approvedBy: context.userId, approvedAt: new Date() },
      });
      const scheduleInput = { installments: [{ dueDate: '2026-12-01', amount: '90.00' }] };
      const schedule = await body(
        await post(
          context,
          `pricing-agreements/${fee.id}/installment-schedules`,
          scheduleInput,
          headers(),
        ),
        201,
      );
      const scheduleEdit = await body(
        await put(
          context,
          `installment-schedules/${schedule.id}`,
          { installments: [{ dueDate: '2026-12-15', amount: '90.00' }] },
          headers(schedule.lockVersion),
        ),
        200,
      );
      await body(
        await post(
          context,
          `installment-schedules/${schedule.id}/approve`,
          undefined,
          headers(scheduleEdit.lockVersion),
        ),
        403,
      );
      for (const path of [
        'programs',
        'cohorts',
        'rooms',
        'trainers',
        'modules',
        'sessions',
        'business-accounts',
        'lead-stages',
        'dashboard/sales',
      ])
        await body(await get(context, path), 200);
      for (const path of [
        'payments',
        'invoices',
        'users',
        'audit-events',
        'certificates',
        'certificate-rules',
        'reports/finance/receivables',
      ])
        await body(await get(context, path), 403);
      await body(await post(context, 'programs', { code: 'DENIED', name: 'Denied program' }), 403);
      await body(
        await post(context, 'lead-stages', { code: 'DENIED', name: 'Denied stage', ordinal: 1 }),
        403,
      );
    });
  }, 120_000);
});
