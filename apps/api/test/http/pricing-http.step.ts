import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FinanceHttpFixture } from './finance-http-fixture';
import { get, post, put } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';

type PricingResult = {
  id: string;
  status: string;
  lockVersion: number;
  totalAmount: string;
};

export async function runPricingHttpStep(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
): Promise<string> {
  const createBody = {
    enrollmentId: fixture.enrollmentId,
    discountAmount: '50.00',
    lines: [line('500.00')],
  };
  const createKey = `pricing-create-${randomUUID()}`;
  const createdResponse = await post(context, 'pricing-agreements', createBody, {
    'idempotency-key': createKey,
  });
  assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
  const created = (await createdResponse.json()) as PricingResult;
  assert.deepEqual(pick(created), { status: 'DRAFT', lockVersion: 1, totalAmount: '450.00' });
  const replay = await post(context, 'pricing-agreements', createBody, {
    'idempotency-key': createKey,
  });
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), created);

  const updateBody = { discountAmount: '40.00', lines: [line('500.00')] };
  const stale = await put(context, `pricing-agreements/${created.id}`, updateBody, {
    'if-match': '99',
    'idempotency-key': `pricing-stale-${randomUUID()}`,
  });
  assert.equal(stale.status, 409);
  assert.equal(errorCode(await stale.json()), 'PRICING_STATE_OR_VERSION_CONFLICT');
  const updatedResponse = await put(context, `pricing-agreements/${created.id}`, updateBody, {
    'if-match': '1',
    'idempotency-key': `pricing-update-${randomUUID()}`,
  });
  assert.equal(updatedResponse.status, 200, await updatedResponse.clone().text());
  const updated = (await updatedResponse.json()) as PricingResult;
  assert.deepEqual(pick(updated), {
    status: 'DRAFT',
    lockVersion: 2,
    totalAmount: '460.00',
  });

  const submitted = await transition(context, created.id, 'submit', 2);
  assert.deepEqual(pick(submitted), {
    status: 'PROPOSED',
    lockVersion: 3,
    totalAmount: '460.00',
  });
  const approved = await transition(context, created.id, 'approve', 3, {
    reason: 'Tier one approval verified over HTTP',
  });
  assert.deepEqual(pick(approved), {
    status: 'APPROVED',
    lockVersion: 4,
    totalAmount: '460.00',
  });

  const scheduleBody = {
    installments: [
      { dueDate: '2026-07-01', amount: '230.00' },
      { dueDate: '2026-08-01', amount: '230.00' },
    ],
  };
  const scheduleResponse = await post(
    context,
    `pricing-agreements/${created.id}/installment-schedules`,
    scheduleBody,
    { 'idempotency-key': `schedule-create-${randomUUID()}` },
  );
  assert.equal(scheduleResponse.status, 201, await scheduleResponse.clone().text());
  const schedule = (await scheduleResponse.json()) as PricingResult;
  assert.deepEqual(pick(schedule), {
    status: 'DRAFT',
    lockVersion: 1,
    totalAmount: '460.00',
  });
  const scheduleUpdate = {
    installments: [
      { dueDate: '2026-06-01', amount: '160.00' },
      { dueDate: '2026-07-01', amount: '150.00' },
      { dueDate: '2026-08-01', amount: '150.00' },
    ],
  };
  const updatedSchedule = await put(
    context,
    `installment-schedules/${schedule.id}`,
    scheduleUpdate,
    { 'if-match': '1', 'idempotency-key': `schedule-update-${randomUUID()}` },
  );
  assert.equal(updatedSchedule.status, 200, await updatedSchedule.clone().text());
  assert.equal(((await updatedSchedule.json()) as PricingResult).lockVersion, 2);
  const scheduleApproved = await post(
    context,
    `installment-schedules/${schedule.id}/approve`,
    undefined,
    { 'if-match': '2', 'idempotency-key': `schedule-approve-${randomUUID()}` },
  );
  assert.equal(scheduleApproved.status, 201, await scheduleApproved.clone().text());
  assert.equal(((await scheduleApproved.json()) as PricingResult).status, 'APPROVED');

  const listed = await get(
    context,
    `pricing-agreements?enrollmentId=${fixture.enrollmentId}&status=APPROVED`,
  );
  assert.equal(listed.status, 200);
  assert.equal(
    ((await listed.json()) as { items: Array<{ id: string }> }).items.some(
      ({ id }) => id === created.id,
    ),
    true,
  );
  const detail = await get(context, `pricing-agreements/${created.id}`);
  assert.equal(detail.status, 200);
  assert.equal(((await detail.json()) as { schedules: unknown[] }).schedules.length, 1);
  await proveRejectRoute(context, fixture.enrollmentId);
  return schedule.id;
}

async function proveRejectRoute(context: HttpTestContext, enrollmentId: string): Promise<void> {
  const createdResponse = await post(
    context,
    'pricing-agreements',
    { enrollmentId, lines: [line('100.00')] },
    { 'idempotency-key': `pricing-reject-create-${randomUUID()}` },
  );
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as PricingResult;
  await transition(context, created.id, 'submit', 1);
  const rejected = await transition(context, created.id, 'reject', 2, {
    reason: 'Rejected by deterministic HTTP scenario',
  });
  assert.equal(rejected.status, 'REJECTED');
}

async function transition(
  context: HttpTestContext,
  agreementId: string,
  action: 'submit' | 'approve' | 'reject',
  version: number,
  body?: unknown,
): Promise<PricingResult> {
  const response = await post(context, `pricing-agreements/${agreementId}/${action}`, body, {
    'if-match': String(version),
    'idempotency-key': `pricing-${action}-${randomUUID()}`,
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as PricingResult;
}

function line(unitAmount: string) {
  return {
    type: 'TUITION',
    descriptionAr: 'رسوم البرنامج',
    descriptionEn: 'Program tuition',
    quantity: '1.00',
    unitAmount,
  };
}

function pick(value: PricingResult) {
  return {
    status: value.status,
    lockVersion: value.lockVersion,
    totalAmount: value.totalAmount,
  };
}

function errorCode(value: unknown): string | undefined {
  return (value as { code?: string }).code;
}
