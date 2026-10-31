import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { SalesOverview } from '../../src/crm/sales-dashboard/sales-dashboard.types';
import type { AcademicDomainFixture } from './domain-academic-catalog-http.step';
import { get, patch, post } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';
type LeadResult = {
  id: string;
  state: string;
  version: number;
  personId?: string | null;
};
export async function runLeadsHttpStep(
  context: HttpTestContext,
  academic: AcademicDomainFixture,
): Promise<void> {
  const assigneeId = await seedLeadStaff(context);
  const suffix = randomUUID().slice(0, 8);
  const assignees = await get(
    context,
    `leads/assignees?branchId=${context.branchId}&search=assignee`,
  );
  assert.equal(assignees.status, 200, await assignees.clone().text());
  assert.equal(
    (
      (await assignees.json()) as {
        items: Array<{
          userId: string;
        }>;
      }
    ).items.some(({ userId }) => userId === assigneeId),
    true,
  );
  const stageResponse = await post(context, 'lead-stages', {
    code: `STG-${suffix}`,
    name: 'Domain HTTP stage',
    ordinal: 10,
  });
  assert.equal(stageResponse.status, 201, await stageResponse.clone().text());
  const stage = (await stageResponse.json()) as {
    id: string;
    version: number;
  };
  const stageUpdate = await patch(
    context,
    `lead-stages/${stage.id}`,
    { name: 'Updated domain stage' },
    { 'if-match': '1' },
  );
  assert.equal(stageUpdate.status, 200, await stageUpdate.clone().text());
  const stages = await get(context, 'lead-stages?includeInactive=true');
  assert.equal(stages.status, 200, await stages.clone().text());
  const leadResponse = await post(context, 'leads', {
    branchId: context.branchId,
    newPerson: {
      name: `Domain Lead ${suffix}`,
      email: `lead-${suffix}@example.test`,
      phone: randomEgyptPhone(),
    },
    stageId: stage.id,
    source: 'HTTP campaign',
    nextActionAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(leadResponse.status, 201, await leadResponse.clone().text());
  const lead = (await leadResponse.json()) as LeadResult;
  assert.equal(lead.state, 'NEW');
  const stale = await patch(
    context,
    `leads/${lead.id}`,
    { source: 'Must not persist' },
    { 'if-match': '99' },
  );
  assert.equal(stale.status, 409);
  const updated = await patch(
    context,
    `leads/${lead.id}`,
    { source: 'Updated HTTP campaign' },
    { 'if-match': '1' },
  );
  assert.equal(updated.status, 200, await updated.clone().text());
  assert.equal(((await updated.json()) as LeadResult).version, 2);
  const claimed = await post(context, `leads/${lead.id}/claim`, undefined, {
    'if-match': '2',
  });
  assert.equal(claimed.status, 201, await claimed.clone().text());
  assert.equal(((await claimed.json()) as LeadResult).version, 3);
  const assigned = await post(
    context,
    `leads/${lead.id}/assign`,
    { userId: assigneeId },
    { 'if-match': '3' },
  );
  assert.equal(assigned.status, 201, await assigned.clone().text());
  assert.equal(((await assigned.json()) as LeadResult).version, 4);
  const activity = await post(context, `leads/${lead.id}/activities`, {
    type: 'CALL',
    data: { outcome: 'interested', pii: false },
  });
  assert.equal(activity.status, 201, await activity.clone().text());
  let current = await transition(context, lead.id, 'open', 4);
  assert.equal(current.state, 'OPEN');
  current = await transition(context, lead.id, 'qualify', 5);
  assert.equal(current.state, 'QUALIFIED');
  current = await transition(context, lead.id, 'lose', 6, {
    reason: 'Budget was temporarily unavailable',
  });
  assert.equal(current.state, 'LOST');
  current = await transition(context, lead.id, 'reopen', 7, {
    reason: 'Budget became available again',
  });
  assert.equal(current.state, 'OPEN');
  current = await transition(context, lead.id, 'disqualify', 8, {
    reason: 'Initial eligibility evidence was incomplete',
  });
  assert.equal(current.state, 'DISQUALIFIED');
  current = await transition(context, lead.id, 'reopen', 9, {
    reason: 'Eligibility evidence has been completed',
  });
  assert.equal(current.state, 'OPEN');
  current = await transition(context, lead.id, 'qualify', 10);
  assert.equal(current.state, 'QUALIFIED');
  const winBody = {
    programVersionId: academic.programVersionId,
    homeBranchId: context.branchId,
    cohortId: academic.cohortId,
    kind: 'INDIVIDUAL',
  };
  const winKey = `lead-win-${randomUUID()}`;
  const wonResponse = await post(context, `leads/${lead.id}/win`, winBody, {
    'if-match': '11',
    'idempotency-key': winKey,
  });
  assert.equal(wonResponse.status, 201, await wonResponse.clone().text());
  const won = (await wonResponse.json()) as {
    leadId: string;
    enrollmentId: string;
    version: number;
  };
  assert.equal(won.leadId, lead.id);
  assert.equal(won.version, 12);
  const winReplay = await post(context, `leads/${lead.id}/win`, winBody, {
    'if-match': '11',
    'idempotency-key': winKey,
  });
  assert.equal(winReplay.status, 201);
  assert.deepEqual(await winReplay.json(), won);
  const list = await get(context, `leads?branchId=${context.branchId}&state=WON`);
  assert.equal(list.status, 200, await list.clone().text());
  const salesOverview = await get(context, 'dashboard/sales');
  assert.equal(salesOverview.status, 200, await salesOverview.clone().text());
  assert.equal(((await salesOverview.json()) as SalesOverview).metrics.convertedLeadsThisMonth, 1);
  const detail = await get(context, `leads/${lead.id}`);
  assert.equal(detail.status, 200, await detail.clone().text());
  assert.equal(
    (
      (await detail.json()) as {
        activities: unknown[];
      }
    ).activities.length,
    1,
  );
  assert.equal(
    await context.prisma.enrollment.count({
      where: {
        organizationId: context.organizationId,
        id: won.enrollmentId,
        state: 'DRAFT',
      },
    }),
    1,
  );
}
async function transition(
  context: HttpTestContext,
  leadId: string,
  action: 'open' | 'qualify' | 'lose' | 'disqualify' | 'reopen',
  version: number,
  body?: unknown,
): Promise<LeadResult> {
  const response = await post(context, `leads/${leadId}/${action}`, body, {
    'if-match': String(version),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as LeadResult;
}
async function seedLeadStaff(context: HttpTestContext): Promise<string> {
  const actorStaff = await context.prisma.staffProfile.create({
    data: {
      organizationId: context.organizationId,
      personId: context.personId,
    },
  });
  await context.prisma.staffBranchAssignment.create({
    data: {
      organizationId: context.organizationId,
      staffProfileId: actorStaff.id,
      branchId: context.branchId,
      startsAt: new Date(Date.now() - 86400000),
    },
  });
  const person = await context.prisma.person.create({
    data: {
      organizationId: context.organizationId,
      publicId: `LEAD-STAFF-${randomUUID().slice(0, 8)}`,
      name: 'Lead HTTP assignee',
    },
  });
  const user = await context.prisma.user.create({
    data: {
      organizationId: context.organizationId,
      personId: person.id,
      status: 'ACTIVE',
    },
  });
  const staff = await context.prisma.staffProfile.create({
    data: { organizationId: context.organizationId, personId: person.id },
  });
  await context.prisma.staffBranchAssignment.create({
    data: {
      organizationId: context.organizationId,
      staffProfileId: staff.id,
      branchId: context.branchId,
      startsAt: new Date(Date.now() - 86400000),
    },
  });
  return user.id;
}
function randomEgyptPhone(): string {
  return `012${Math.floor(10000000 + Math.random() * 89999999)}`;
}
