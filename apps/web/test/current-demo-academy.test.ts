// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { academyFixtures } from '@/api/demo/academy-fixtures';
import { handleAcademyPricingRoute } from '@/api/demo/academy-pricing-routes';
import { handleAcademyRoute } from '@/api/demo/academy-routes';
import { branchId, type DemoContext, type DemoState, demoId, find } from '@/api/demo/shared';

function fixture(): DemoState {
  return { collections: academyFixtures(), locale: 'en', authenticated: true, sequence: 10000 };
}
function call(
  state: DemoState,
  path: string,
  method = 'GET',
  body: Record<string, unknown> = {},
  version?: number,
) {
  const url = new URL(`http://demo.test/api/v1/${path}`);
  const request = new Request(url, {
    method,
    headers: version === undefined ? {} : { 'if-match': String(version) },
  });
  const context: DemoContext = {
    state,
    path: url.pathname.slice('/api/v1/'.length).split('/'),
    method,
    body,
    url,
    request,
  };
  return handleAcademyPricingRoute(context) ?? handleAcademyRoute(context);
}
async function data(response: Response | null) {
  expect(response).not.toBeNull();
  if (!response) throw new Error('Missing route');
  expect(response.ok).toBe(true);
  return response.json();
}
describe('current frontend academy demo contracts', () => {
  it('returns compatible list envelopes and fully linked detail collections', async () => {
    const state = fixture();
    for (const noun of [
      'students',
      'leads',
      'student-registrations',
      'enrollments',
      'programs',
      'cohorts',
      'rooms',
      'trainers',
      'modules',
    ]) {
      const list = await data(call(state, noun));
      expect(list.items.length).toBeGreaterThan(0);
      expect(list.nextCursor).toBeNull();
    }
    expect(await data(call(state, 'lead-stages'))).toHaveLength(4);
    const student = await data(call(state, `students/${demoId(200)}`));
    expect(student.enrollmentSummary.program.name).toBe('Full Stack Development');
    expect(student.enrollments[0].cohort.id).toBe(demoId(150));
    expect(student.contacts[0].rawValue).toMatch(/example\.invalid$/);
    const program = await data(call(state, `programs/${demoId(100)}`));
    const version = await data(call(state, `program-versions/${program.versions[0].id}`));
    expect(version.modules).toHaveLength(3);
    expect(version.modules[0].module.name).toBe('HTML & accessible interfaces');
  });
  it('creates and edits a student, filters results, and rejects stale writes or invalid contacts', async () => {
    const state = fixture();
    const student = await data(
      call(state, 'students', 'POST', {
        name: 'Demo Explorer',
        email: 'explorer@example.invalid',
        branchId,
      }),
    );
    expect((await data(call(state, 'students?search=Explorer'))).items).toHaveLength(1);
    await data(
      call(state, `students/${student.id}`, 'PATCH', { name: 'Demo Explorer Updated' }, 1),
    );
    expect(call(state, `students/${student.id}`, 'PATCH', { name: 'Stale' }, 1)?.status).toBe(409);
    expect(
      call(
        state,
        `students/${student.id}/contacts`,
        'PUT',
        { contacts: [{ type: 'EMAIL', value: 'bad', isPrimary: true }] },
        2,
      )?.status,
    ).toBe(400);
    const updated = await data(
      call(
        state,
        `students/${student.id}/contacts`,
        'PUT',
        { contacts: [{ type: 'EMAIL', value: 'updated@example.invalid', isPrimary: true }] },
        2,
      ),
    );
    expect(updated.email).toBe('updated@example.invalid');
    expect(updated.name).toBe('Demo Explorer Updated');
  });
  it('advances a lead through valid states and converts it into a linked enrollment', async () => {
    const state = fixture();
    const lead = await data(
      call(state, 'leads', 'POST', { newPerson: { name: 'Demo Prospect' }, branchId }),
    );
    expect(call(state, `leads/${lead.id}/qualify`, 'POST', {}, 1)?.status).toBe(409);
    await data(call(state, `leads/${lead.id}/open`, 'POST', {}, 1));
    await data(call(state, `leads/${lead.id}/qualify`, 'POST', {}, 2));
    const enrollment = await data(
      call(
        state,
        `leads/${lead.id}/win`,
        'POST',
        {
          cohortId: demoId(150),
          programVersionId: demoId(110),
          homeBranchId: branchId,
          kind: 'INDIVIDUAL',
        },
        3,
      ),
    );
    expect(enrollment.student.name).toBe('Demo Prospect');
    expect(enrollment.finance.balance).toBe('0.00');
    expect(find(state, 'leads', lead.id)?.state).toBe('WON');
    expect(find(state, 'billingAccounts', enrollment.billingAccountId)).toBeDefined();
  });
  it('preserves semantic curriculum version while advancing optimistic record versions', async () => {
    const state = fixture();
    const version = await data(
      call(state, `programs/${demoId(100)}/versions`, 'POST', {
        modules: [{ moduleId: demoId(120), ordinal: 1, required: true }],
      }),
    );
    expect(version.version).toBe(2);
    const published = await data(
      call(
        state,
        `program-versions/${version.id}/publish`,
        'POST',
        { effectiveFrom: '2026-11-01' },
        1,
      ),
    );
    expect(published.version).toBe(2);
    expect(published.recordVersion).toBe(2);
    expect(
      call(state, `program-versions/${version.id}/archive`, 'POST', { reason: 'New curriculum' }, 1)
        ?.status,
    ).toBe(409);
    expect((await data(call(state, `programs/${demoId(100)}`))).versions).toHaveLength(2);
  });
  it('records enrollment transitions and cancellation decisions without fabricating unknown actions', async () => {
    const state = fixture();
    const id = demoId(311);
    await data(call(state, `enrollments/${id}/submit`, 'POST', {}, 1));
    await data(call(state, `enrollments/${id}/activate`, 'POST', {}, 2));
    const request = await data(
      call(
        state,
        `enrollments/${id}/cancellation-requests`,
        'POST',
        { reason: 'Sample schedule change' },
        3,
      ),
    );
    await data(
      call(state, `enrollment-cancellation-requests/${request.id}/approve`, 'POST', {
        reason: 'Sample approval',
      }),
    );
    expect(find(state, 'enrollments', id)?.state).toBe('CANCELLED');
    expect(call(state, `enrollments/${id}/teleport`, 'POST')).toBeNull();
  });
  it('supports exact minor-unit pricing and validates installment totals before approval', async () => {
    const state = fixture();
    const fee = await data(
      call(state, 'pricing-agreements', 'POST', {
        enrollmentId: demoId(311),
        discountAmount: '0.00',
        lines: [
          {
            type: 'TUITION',
            descriptionEn: 'Sample fee',
            descriptionAr: 'رسوم تجريبية',
            quantity: '1',
            unitAmount: '0.30',
          },
        ],
      }),
    );
    expect(
      call(state, 'pricing-agreements', 'POST', {
        enrollmentId: demoId(311),
        currencyCode: 'USD',
        lines: fee.lines,
      })?.status,
    ).toBe(400);
    await data(call(state, `pricing-agreements/${fee.id}/submit`, 'POST', {}, 1));
    await data(
      call(state, `pricing-agreements/${fee.id}/approve`, 'POST', { reason: 'Sample approval' }, 2),
    );
    expect(
      call(state, `pricing-agreements/${fee.id}/installment-schedules`, 'POST', {
        installments: [{ dueDate: '2026-11-01', amount: '0.29' }],
      })?.status,
    ).toBe(400);
    const schedule = await data(
      call(state, `pricing-agreements/${fee.id}/installment-schedules`, 'POST', {
        installments: [
          { dueDate: '2026-11-01', amount: '0.10' },
          { dueDate: '2026-12-01', amount: '0.20' },
        ],
      }),
    );
    await data(call(state, `installment-schedules/${schedule.id}/approve`, 'POST', {}, 1));
    expect(find(state, 'feeAgreements', fee.id)?.totalAmount).toBe('0.30');
    expect(find(state, 'feeSchedules', schedule.id)?.status).toBe('APPROVED');
  });
});
