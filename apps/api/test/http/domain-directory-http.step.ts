import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get, patch, post, put } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';
export type DirectoryDomainFixture = {
  studentPersonId: string;
  businessAccountId: string;
  corporateBillingAccountId: string;
};
export async function runDirectoryHttpStep(
  context: HttpTestContext,
): Promise<DirectoryDomainFixture> {
  const suffix = randomUUID().slice(0, 8);
  const email = `directory-${suffix}@example.test`;
  const phone = randomEgyptPhone();
  const createStudent = await post(context, 'students', {
    name: `Directory Student ${suffix}`,
    email,
    phone,
    birthDate: '2000-01-01',
    gender: 'MALE',
    branchId: context.branchId,
  });
  assert.equal(createStudent.status, 201, await createStudent.clone().text());
  const student = (await createStudent.json()) as {
    id: string;
    version: number;
    billingAccountId: string;
  };
  assert.equal(student.version, 1);
  const candidates = await post(context, 'students/match-candidates', {
    email,
  });
  assert.equal(candidates.status, 201, await candidates.clone().text());
  assert.equal(
    (
      (await candidates.json()) as Array<{
        personId: string;
      }>
    ).some(({ personId }) => personId === student.id),
    true,
  );
  const staleStudent = await patch(
    context,
    `students/${student.id}`,
    { name: 'Must not persist' },
    { 'if-match': '99' },
  );
  assert.equal(staleStudent.status, 409);
  const updatedStudent = await patch(
    context,
    `students/${student.id}`,
    { name: `Updated Directory Student ${suffix}`, gender: 'MALE' },
    { 'if-match': '1' },
  );
  assert.equal(updatedStudent.status, 200, await updatedStudent.clone().text());
  assert.equal(
    (
      (await updatedStudent.json()) as {
        version: number;
      }
    ).version,
    2,
  );
  const contacts = await put(
    context,
    `students/${student.id}/contacts`,
    {
      contacts: [
        { type: 'EMAIL', value: email, isPrimary: true },
        { type: 'PHONE', value: phone, isPrimary: true },
      ],
    },
    { 'if-match': '2' },
  );
  assert.equal(contacts.status, 200, await contacts.clone().text());
  assert.equal(
    (
      (await contacts.json()) as {
        version: number;
      }
    ).version,
    3,
  );
  const students = await get(context, `students?search=${suffix}`);
  assert.equal(students.status, 200, await students.clone().text());
  const detail = await get(context, `students/${student.id}`);
  assert.equal(detail.status, 200, await detail.clone().text());
  assert.equal(
    (
      (await detail.json()) as {
        contacts: unknown[];
      }
    ).contacts.length,
    2,
  );
  await context.prisma.lead.create({
    data: {
      organizationId: context.organizationId,
      branchId: context.branchId,
      personId: student.id,
      source: 'Directory HTTP contact candidate',
    },
  });
  const contactCandidates = await get(
    context,
    `business-accounts/contact-candidates?branchId=${context.branchId}&search=${suffix}`,
  );
  assert.equal(contactCandidates.status, 200, await contactCandidates.clone().text());
  assert.equal(
    (
      (await contactCandidates.json()) as {
        items: Array<{
          personId: string;
        }>;
      }
    ).items.some(({ personId }) => personId === student.id),
    true,
  );
  const businessResponse = await post(context, 'business-accounts', {
    owningBranchId: context.branchId,
    legalName: `Domain Company ${suffix} LLC`,
    displayName: `Domain Company ${suffix}`,
    registrationNo: `REG-${suffix}`,
    taxId: `TAX-${suffix}`,
    contacts: [{ personId: student.id, role: 'Training coordinator', isPrimary: true }],
  });
  assert.equal(businessResponse.status, 201, await businessResponse.clone().text());
  const business = (await businessResponse.json()) as {
    id: string;
    version: number;
    billingAccountId: string;
  };
  const staleBusiness = await patch(
    context,
    `business-accounts/${business.id}`,
    { displayName: 'Must not persist' },
    { 'if-match': '99' },
  );
  assert.equal(staleBusiness.status, 409);
  const updatedBusiness = await patch(
    context,
    `business-accounts/${business.id}`,
    { displayName: `Updated Domain Company ${suffix}` },
    { 'if-match': '1' },
  );
  assert.equal(updatedBusiness.status, 200, await updatedBusiness.clone().text());
  assert.equal(
    (
      (await updatedBusiness.json()) as {
        version: number;
      }
    ).version,
    2,
  );
  const businessContacts = await put(
    context,
    `business-accounts/${business.id}/contacts`,
    {
      contacts: [{ personId: student.id, role: 'Primary coordinator', isPrimary: true }],
    },
    { 'if-match': '2' },
  );
  assert.equal(businessContacts.status, 200, await businessContacts.clone().text());
  assert.equal(
    (
      (await businessContacts.json()) as {
        version: number;
      }
    ).version,
    3,
  );
  const businesses = await get(context, `business-accounts?search=${suffix}`);
  assert.equal(businesses.status, 200, await businesses.clone().text());
  const businessDetail = await get(context, `business-accounts/${business.id}`);
  assert.equal(businessDetail.status, 200, await businessDetail.clone().text());
  const businessBody = (await businessDetail.json()) as {
    contacts: unknown[];
    billingAccount: {
      id: string;
    };
  };
  assert.equal(businessBody.contacts.length, 1);
  assert.equal(businessBody.billingAccount.id, business.billingAccountId);
  const mergeTargetResponse = await post(context, 'students', {
    name: `Merge Target ${suffix}`,
    branchId: context.branchId,
  });
  assert.equal(mergeTargetResponse.status, 201, await mergeTargetResponse.clone().text());
  const mergeTarget = (await mergeTargetResponse.json()) as {
    id: string;
    version: number;
  };
  const mergeKey = `student-merge-${randomUUID()}`;
  const mergeBody = {
    targetPersonId: mergeTarget.id,
    targetVersion: mergeTarget.version,
    reason: 'Confirmed duplicate student identity in the directory',
  };
  const mergedResponse = await post(context, `students/${student.id}/merge`, mergeBody, {
    'if-match': '3',
    'idempotency-key': mergeKey,
  });
  assert.equal(mergedResponse.status, 201, await mergedResponse.clone().text());
  const merged = (await mergedResponse.json()) as {
    sourcePersonId: string;
    targetPersonId: string;
  };
  assert.equal(merged.sourcePersonId, student.id);
  assert.equal(merged.targetPersonId, mergeTarget.id);
  const mergeReplay = await post(context, `students/${student.id}/merge`, mergeBody, {
    'if-match': '3',
    'idempotency-key': mergeKey,
  });
  assert.equal(mergeReplay.status, 201, await mergeReplay.clone().text());
  assert.deepEqual(await mergeReplay.json(), merged);
  return {
    studentPersonId: mergeTarget.id,
    businessAccountId: business.id,
    corporateBillingAccountId: business.billingAccountId,
  };
}
function randomEgyptPhone(): string {
  return `010${Math.floor(10000000 + Math.random() * 89999999)}`;
}
