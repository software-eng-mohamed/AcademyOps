import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runHttpScenario } from './http-test-harness';
import { get, patch, post, put } from './finance-http-client';
import { seedBusinessFixture } from './business-chain-fixture';
import { body, databaseDescribe, headers, sales } from './sales-http-support';

databaseDescribe('Sales assigned people and company workflows over HTTP', () => {
  it('hands off an assigned lead without retaining read access and manages company contacts', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'SALES' }, async (context) => {
      await sales(context);
      const organizationId = context.organizationId;
      const person = await context.prisma.person.create({
        data: {
          organizationId,
          publicId: `SALES-${randomUUID().slice(0, 18)}`,
          name: 'Other salesperson',
        },
      });
      const user = await context.prisma.user.create({
        data: { organizationId, personId: person.id, status: 'ACTIVE' },
      });
      const staff = await context.prisma.staffProfile.create({
        data: { organizationId, personId: person.id },
      });
      await context.prisma.staffBranchAssignment.create({
        data: { organizationId, staffProfileId: staff.id, branchId: context.branchId },
      });
      const role = await context.prisma.userRoleAssignment.findFirstOrThrow({
        where: { userId: context.userId },
      });
      await context.prisma.userRoleAssignment.create({
        data: { organizationId, userId: user.id, roleId: role.roleId },
      });
      const lead = await body(
        await post(context, 'leads', {
          branchId: context.branchId,
          newPerson: { name: 'Handoff lead' },
        }),
        201,
      );
      const assigned = await body(
        await post(context, `leads/${lead.id}/assign`, { userId: user.id }, headers()),
        201,
      );
      expect(assigned.assignedUserId).toBe(user.id);
      await body(await get(context, `leads/${lead.id}`), 404);
      await body(
        await patch(
          context,
          `leads/${lead.id}`,
          { source: 'Unauthorized change' },
          headers(assigned.version),
        ),
        404,
      );
      await body(
        await post(context, `leads/${lead.id}/claim`, undefined, headers(assigned.version)),
        409,
      );
      const listed = await body<{ items: { id: string }[] }>(await get(context, 'leads'), 200);
      expect(listed.items.map((item) => item.id)).not.toContain(lead.id);
      // Known unassigned branch lead: claim is allowed, broad read is not.
      const unassigned = await context.prisma.lead.create({
        data: { organizationId, branchId: context.branchId, personId: person.id, state: 'NEW' },
      });
      await body(await get(context, `leads/${unassigned.id}`), 404);
      await body(await post(context, `leads/${unassigned.id}/claim`, undefined, headers()), 201);
      await body(await get(context, `leads/${unassigned.id}`), 200);
      const company = await body(
        await post(context, 'business-accounts', {
          owningBranchId: context.branchId,
          legalName: 'Sales QA Ltd',
          displayName: 'Sales QA',
          contacts: [{ personId: person.id, role: 'Training coordinator', isPrimary: true }],
        }),
        201,
      );
      await body(await get(context, `business-accounts/${company.id}`), 200);
      await body(
        await put(
          context,
          `business-accounts/${company.id}/contacts`,
          { contacts: [{ personId: context.personId, role: 'Account contact', isPrimary: true }] },
          headers(),
        ),
        200,
      );
      const archived = await body(
        await patch(
          context,
          `business-accounts/${company.id}`,
          { displayName: 'Sales QA updated', status: 'ARCHIVED' },
          headers(2),
        ),
        200,
      );
      expect(archived.status).toBe('ARCHIVED');
      expect(
        await body<{ code: string }>(
          await patch(
            context,
            `business-accounts/${company.id}`,
            { status: 'ACTIVE' },
            headers(archived.version),
          ),
          409,
        ),
      ).toMatchObject({ code: 'BUSINESS_ACCOUNT_ARCHIVED' });
      await body(
        await patch(
          context,
          `business-accounts/${company.id}`,
          { displayName: 'Archived details updated' },
          headers(archived.version),
        ),
        200,
      );
      await body(
        await patch(
          context,
          `business-accounts/${company.id}`,
          { displayName: 'Stale' },
          headers(),
        ),
        409,
      );
      await body(
        await get(
          context,
          `business-accounts/contact-candidates?branchId=${context.branchId}&search=Other`,
        ),
        200,
      );
    });
  }, 120_000);
  it('retains its own new student, contacts and enrollment without seeing other students', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'SALES' }, async (context) => {
      await sales(context);
      const fixture = await seedBusinessFixture(context);
      const suffix = randomUUID().slice(0, 8);
      const student = await body(
        await post(context, 'students', {
          name: `Sales ${suffix}`,
          email: `${suffix}@example.test`,
          branchId: context.branchId,
        }),
        201,
      );
      await body(await get(context, `students/${student.id}`), 200);
      const listed = await body<{ items: { id: string }[] }>(
        await get(context, `students?search=${suffix}`),
        200,
      );
      expect(listed.items.map((item) => item.id)).toEqual([student.id]);
      const matches = await body<{ personId: string }[]>(
        await post(context, 'students/match-candidates', { email: `${suffix}@example.test` }),
        201,
      );
      expect(matches.map((item) => item.personId)).toContain(student.id);
      await body(
        await patch(
          context,
          `students/${student.id}`,
          { name: `Updated Sales ${suffix}` },
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
      for (const id of [fixture.studentPersonId, fixture.foreignStudentPersonId]) {
        await body(await get(context, `students/${id}`), 404);
        await body(await patch(context, `students/${id}`, { name: 'Denied edit' }, headers()), 404);
      }
      await body(await get(context, `enrollments/${fixture.secondEnrollmentId}`), 404);
      // An already-active, actor-created enrollment is a reviewer-owned fixture
      // prerequisite; Sales receives no activation or cancellation-approval grant.
      await context.prisma.enrollmentEvent.create({
        data: {
          organizationId: context.organizationId,
          enrollmentId: fixture.secondEnrollmentId,
          type: 'CREATE',
          actorUserId: context.userId,
          toState: 'DRAFT',
        },
      });
      const cancellationKey = headers();
      const cancellationInput = { reason: 'Synthetic Sales cancellation request' };
      const cancellation = await body(
        await post(
          context,
          `enrollments/${fixture.secondEnrollmentId}/cancellation-requests`,
          cancellationInput,
          cancellationKey,
        ),
        201,
      );
      expect(cancellation.status).toBe('REQUESTED');
      expect(
        await body(
          await post(
            context,
            `enrollments/${fixture.secondEnrollmentId}/cancellation-requests`,
            cancellationInput,
            cancellationKey,
          ),
          201,
        ),
      ).toEqual(cancellation);
      expect(
        (await body(await get(context, `enrollments/${fixture.secondEnrollmentId}`), 200)).state,
      ).toBe('ACTIVE');
      for (const action of ['approve', 'reject'])
        await body(
          await post(
            context,
            `enrollment-cancellation-requests/${cancellation.id}/${action}`,
            { reason: 'Not a Sales decision' },
            headers(),
          ),
          403,
        );
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
      await body(await get(context, `enrollments/${draft.id}`), 200);
      const submitted = await body(
        await post(context, `enrollments/${draft.id}/submit`, undefined, headers()),
        201,
      );
      expect(submitted.state).toBe('PENDING_APPROVAL');
      for (const action of ['activate', 'reject', 'postpone', 'complete', 'resume'])
        await body(
          await post(
            context,
            `enrollments/${draft.id}/${action}`,
            { reason: 'Sales cannot approve academic decisions' },
            headers(submitted.version),
          ),
          403,
        );
    });
  }, 120_000);
});
