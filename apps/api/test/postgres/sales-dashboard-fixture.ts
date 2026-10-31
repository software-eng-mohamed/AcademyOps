import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { AccessContext, AccessScope } from '@academyops/contracts';

export const SALES_NOW = new Date('2026-09-02T09:00:00Z');

export async function salesFixture(tx: Prisma.TransactionClient) {
  const org = await tx.organization.create({
    data: { code: `SALES-${randomUUID()}`, name: 'Sales test' },
  });
  const foreignOrg = await tx.organization.create({
    data: { code: `OTHER-${randomUUID()}`, name: 'Other test' },
  });
  const branch = await tx.branch.create({ data: { organizationId: org.id, code: 'A', name: 'A' } });
  const otherBranch = await tx.branch.create({
    data: { organizationId: org.id, code: 'B', name: 'B' },
  });
  const foreignBranch = await tx.branch.create({
    data: { organizationId: foreignOrg.id, code: 'C', name: 'C' },
  });
  const person = await tx.person.create({
    data: { organizationId: org.id, publicId: 'S1', name: 'Sales one' },
  });
  const otherPerson = await tx.person.create({
    data: { organizationId: org.id, publicId: 'S2', name: 'Sales two' },
  });
  const user = await tx.user.create({
    data: { organizationId: org.id, personId: person.id, status: 'ACTIVE' },
  });
  const otherUser = await tx.user.create({
    data: { organizationId: org.id, personId: otherPerson.id, status: 'ACTIVE' },
  });
  const stage = await tx.leadStage.create({
    data: { organizationId: org.id, code: 'NEW', name: 'New enquiry', ordinal: 1 },
  });

  const access = (scopes: AccessScope[] = ['A'], actorUserId = user.id): AccessContext => ({
    organizationId: org.id,
    actorUserId,
    branchIds: new Set([branch.id]),
    assignedResourceIds: new Set(),
    grants: new Map([['leads.read', new Set(scopes)]]),
  });
  const lead = async (data: Partial<Prisma.LeadUncheckedCreateInput> = {}) => {
    const { state = 'NEW', ...fields } = data;
    let created = await tx.lead.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        assignedUserId: user.id,
        personId: person.id,
        stageId: stage.id,
        state: 'NEW',
        createdAt: new Date('2026-09-01T06:00:00Z'),
        nextActionAt: new Date('2026-09-02T10:00:00Z'),
        ...fields,
      },
    });
    const transitions =
      state === 'WON' ? ['OPEN', 'QUALIFIED', 'WON'] : state === 'NEW' ? [] : [state];
    for (const nextState of transitions)
      created = await tx.lead.update({
        where: { id: created.id },
        data: { state: nextState, version: { increment: 1 } },
      });
    return created;
  };
  const convert = async (leadId: string, convertedAt: Date) => {
    await tx.studentProfile.upsert({
      where: { organizationId_personId: { organizationId: org.id, personId: person.id } },
      create: { organizationId: org.id, personId: person.id },
      update: {},
    });
    const program = await tx.program.create({
      data: { organizationId: org.id, code: randomUUID(), name: 'Test program' },
    });
    const version = await tx.programVersion.create({
      data: { organizationId: org.id, programId: program.id, version: 1 },
    });
    const module = await tx.academicModule.create({
      data: { organizationId: org.id, code: randomUUID(), name: 'Test module' },
    });
    await tx.programVersionModule.create({
      data: {
        organizationId: org.id,
        programVersionId: version.id,
        moduleId: module.id,
        ordinal: 1,
      },
    });
    await tx.programVersion.update({
      where: { id: version.id },
      data: { status: 'PUBLISHED', effectiveFrom: new Date('2026-01-01') },
    });
    const billing =
      (await tx.billingAccount.findFirst({
        where: { organizationId: org.id, personId: person.id, kind: 'INDIVIDUAL' },
      })) ??
      (await tx.billingAccount.create({
        data: { organizationId: org.id, personId: person.id, kind: 'INDIVIDUAL' },
      }));
    const enrollment = await tx.enrollment.create({
      data: {
        organizationId: org.id,
        studentPersonId: person.id,
        programVersionId: version.id,
        homeBranchId: branch.id,
        billingAccountId: billing.id,
      },
    });
    return tx.leadConversion.create({
      data: {
        organizationId: org.id,
        leadId,
        personId: person.id,
        enrollmentId: enrollment.id,
        convertedBy: user.id,
        convertedAt,
      },
    });
  };
  return {
    org,
    foreignOrg,
    branch,
    otherBranch,
    foreignBranch,
    user,
    otherUser,
    access,
    lead,
    convert,
  };
}
