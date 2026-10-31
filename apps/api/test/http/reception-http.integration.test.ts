import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runHttpScenario } from './http-test-harness';
import { get, patch, post, put } from './finance-http-client';
import { seedBusinessFixture } from './business-chain-fixture';
import { reception, body, headers } from './reception-role-http-support';
const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

databaseDescribe('Reception with the shipped branch grants over authenticated HTTP', () => {
  it('creates and follows leads, converts and submits enrollment, proposes fees without approving them', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'RECEPTION' }, async (context) => {
      await reception(context);
      const fixture = await seedBusinessFixture(context);
      const suffix = randomUUID().slice(0, 8);
      const student = await body(
        await post(context, 'students', {
          name: `Reception ${suffix}`,
          email: `${suffix}@example.test`,
          branchId: context.branchId,
        }),
        201,
      );
      const listed = await body<{ items: Array<{ id: string }> }>(
        await get(context, `students?search=${suffix}`),
        200,
      );
      expect(listed.items.map((item) => item.id)).toContain(student.id);
      const matches = await body<Array<{ personId: string }>>(
        await post(context, 'students/match-candidates', { email: `${suffix}@example.test` }),
        201,
      );
      expect(matches.map((item) => item.personId)).toContain(student.id);
      await body(
        await patch(
          context,
          `students/${student.id}`,
          { name: `Updated Reception ${suffix}` },
          headers(),
        ),
        200,
      );
      await body(
        await put(
          context,
          `students/${student.id}/contacts`,
          { contacts: [{ type: 'EMAIL', value: `${suffix}@example.test`, isPrimary: true }] },
          headers(2),
        ),
        200,
      );
      await body(
        await patch(context, `students/${student.id}`, { gender: 'FEMALE' }, headers(3)),
        403,
      );
      await body(await get(context, `students/${fixture.foreignStudentPersonId}`), 404);
      const draft = await body(
        await post(context, 'enrollments', {
          studentPersonId: student.id,
          programVersionId: fixture.programVersionId,
          cohortId: fixture.cohortId,
          homeBranchId: context.branchId,
          kind: 'INDIVIDUAL',
        }),
        201,
      );
      expect(draft.state).toBe('DRAFT');

      const lead = await body(
        await post(context, 'leads', {
          branchId: context.branchId,
          newPerson: { name: `Reception lead ${suffix}` },
          source: 'Front desk',
          nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
        201,
      );
      let version = (
        await body(await post(context, `leads/${lead.id}/claim`, undefined, headers()), 201)
      ).version;
      await body(
        await post(
          context,
          `leads/${lead.id}/assign`,
          { userId: context.userId },
          headers(version),
        ),
        403,
      );
      await body(
        await post(context, `leads/${lead.id}/activities`, {
          type: 'NOTE',
          data: { note: 'Synthetic reception follow-up' },
        }),
        201,
      );
      for (const command of [
        'open',
        'qualify',
        'lose',
        'reopen',
        'disqualify',
        'reopen',
        'qualify',
      ]) {
        const result = await body(
          await post(
            context,
            `leads/${lead.id}/${command}`,
            ['lose', 'reopen', 'disqualify'].includes(command)
              ? { reason: 'Synthetic reception follow-up' }
              : undefined,
            headers(version),
          ),
          201,
        );
        version = result.version;
      }
      const winKey = headers(version);
      const winInput = {
        programVersionId: fixture.programVersionId,
        homeBranchId: context.branchId,
        cohortId: fixture.cohortId,
        kind: 'INDIVIDUAL',
      };
      const won = await body(await post(context, `leads/${lead.id}/win`, winInput, winKey), 201);
      expect(
        await body(await post(context, `leads/${lead.id}/win`, winInput, winKey), 201),
      ).toEqual(won);
      await body(await get(context, `leads/${lead.id}`), 200);
      await body(await get(context, `leads?state=WON`), 200);
      await body(await get(context, `enrollments/${won.enrollmentId}`), 200);
      const enrollmentId = won.enrollmentId;
      const line = {
        type: 'TUITION',
        descriptionEn: 'Course fees',
        descriptionAr: 'رسوم الكورس',
        quantity: '1.00',
        unitAmount: '100.00',
      };
      const createHeaders = headers();
      const pricingInput = { enrollmentId, discountAmount: '0.00', lines: [line] };
      const fee = await body(
        await post(context, 'pricing-agreements', pricingInput, createHeaders),
        201,
      );
      expect(
        await body(await post(context, 'pricing-agreements', pricingInput, createHeaders), 201),
      ).toEqual(fee);
      const edit = await body(
        await put(
          context,
          `pricing-agreements/${fee.id}`,
          { discountAmount: '10.00', lines: [line] },
          headers(fee.lockVersion),
        ),
        200,
      );
      const proposal = await body(
        await post(
          context,
          `pricing-agreements/${fee.id}/submit`,
          undefined,
          headers(edit.lockVersion),
        ),
        201,
      );
      expect(proposal.status).toBe('PROPOSED');
      for (const action of ['approve', 'reject'])
        await body(
          await post(
            context,
            `pricing-agreements/${fee.id}/${action}`,
            { reason: 'Reception cannot approve pricing' },
            headers(proposal.lockVersion),
          ),
          403,
        );
      const fees = await body<{ items: Array<{ id: string; enrollmentId: string }> }>(
        await get(context, `pricing-agreements?enrollmentId=${enrollmentId}`),
        200,
      );
      expect(fees.items.map((item) => item.id)).toEqual([fee.id]);
      expect(
        (await body(await get(context, `pricing-agreements/${fee.id}`), 200)).enrollmentId,
      ).toBe(enrollmentId);
      // Approval is a reviewer-owned prerequisite, not an added Reception permission.
      await context.prisma.pricingAgreement.update({
        where: { id: fee.id },
        data: { status: 'APPROVED', approvedBy: context.userId, approvedAt: new Date() },
      });
      const installment = { dueDate: '2026-12-01', amount: '90.00' };
      const scheduleKey = headers();
      const scheduleInput = { installments: [installment] };
      const schedule = await body(
        await post(
          context,
          `pricing-agreements/${fee.id}/installment-schedules`,
          scheduleInput,
          scheduleKey,
        ),
        201,
      );
      expect(schedule.status).toBe('DRAFT');
      expect(
        await body(
          await post(
            context,
            `pricing-agreements/${fee.id}/installment-schedules`,
            scheduleInput,
            scheduleKey,
          ),
          201,
        ),
      ).toEqual(schedule);
      const editedSchedule = await body(
        await put(
          context,
          `installment-schedules/${schedule.id}`,
          {
            installments: [{ ...installment, dueDate: '2026-12-15' }],
          },
          headers(schedule.lockVersion),
        ),
        200,
      );
      await body(
        await post(
          context,
          `installment-schedules/${schedule.id}/approve`,
          undefined,
          headers(editedSchedule.lockVersion),
        ),
        403,
      );
      const submitted = await body(
        await post(context, `enrollments/${enrollmentId}/submit`, undefined, headers()),
        201,
      );
      expect(submitted.state).toBe('PENDING_APPROVAL');
      for (const action of ['activate', 'reject', 'postpone', 'complete', 'resume'])
        await body(
          await post(
            context,
            `enrollments/${enrollmentId}/${action}`,
            { reason: 'Reception has no academic decision authority' },
            headers(submitted.version),
          ),
          403,
        );
      const cancellation = await body(
        await post(
          context,
          `enrollments/${fixture.secondEnrollmentId}/cancellation-requests`,
          { reason: 'Reception cancellation request' },
          headers(),
        ),
        201,
      );
      expect(cancellation.status).toBe('REQUESTED');
      for (const action of ['approve', 'reject'])
        await body(
          await post(
            context,
            `enrollment-cancellation-requests/${cancellation.id}/${action}`,
            { reason: 'Not a reception decision' },
            headers(),
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
        'dashboard/workspaces/RECEPTION',
      ])
        await body(await get(context, path), 200);
      for (const path of [
        'payments',
        'invoices',
        'users',
        'audit-events',
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
