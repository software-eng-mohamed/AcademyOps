import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { AccessContext, AccessScope, PermissionCode } from '@academyops/contracts';
import { AcademicSessionLifecycleService } from '../../src/academic/academic-session-lifecycle.service';
import { AcademicSessionMutationService } from '../../src/academic/academic-session-mutation.service';
import type { CreateSessionDto } from '../../src/academic/academic.dto';
import { SessionSchedulePolicyService } from '../../src/academic/session-schedule-policy.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import type { PrismaService } from '../../src/platform/database/prisma.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
function prismaAdapter(transaction: Prisma.TransactionClient): PrismaService {
  const adapter = {
    cohort: transaction.cohort,
    cohortModule: transaction.cohortModule,
    room: transaction.room,
    trainerProfile: transaction.trainerProfile,
    session: transaction.session,
    sessionTrainer: transaction.sessionTrainer,
    idempotencyRecord: transaction.idempotencyRecord,
    auditEvent: transaction.auditEvent,
    outboxEvent: transaction.outboxEvent,
    $queryRaw: transaction.$queryRaw.bind(transaction),
    serializable: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
      await transaction.$executeRawUnsafe('SAVEPOINT academic_session_work');
      try {
        const result = await work(transaction);
        await transaction.$executeRawUnsafe('RELEASE SAVEPOINT academic_session_work');
        return result;
      } catch (error) {
        await transaction.$executeRawUnsafe('ROLLBACK TO SAVEPOINT academic_session_work');
        await transaction.$executeRawUnsafe('RELEASE SAVEPOINT academic_session_work');
        throw error;
      }
    },
  };
  return adapter as unknown as PrismaService;
}
function access(
  organizationId: string,
  actorUserId: string,
  branches: string[],
  scopes: AccessScope[],
): AccessContext {
  const grants = scopes.length
    ? new Map<PermissionCode, ReadonlySet<AccessScope>>([
        ['academic.sessions.manage', new Set(scopes)],
      ])
    : new Map<PermissionCode, ReadonlySet<AccessScope>>();
  return {
    organizationId,
    actorUserId,
    branchIds: new Set(branches),
    assignedResourceIds: new Set(),
    grants,
  };
}
export async function setupAcademicSessionFixture(transaction: Prisma.TransactionClient) {
  const suffix = randomUUID().slice(0, 8);
  const org = await transaction.organization.create({
    data: { code: `AC-${suffix}`, name: 'Academy' },
  });
  const foreignOrg = await transaction.organization.create({
    data: { code: `FO-${suffix}`, name: 'Foreign' },
  });
  const branch = await transaction.branch.create({
    data: {
      organizationId: org.id,
      code: `MAIN-${suffix}`,
      name: 'Main',
    },
  });
  const otherBranch = await transaction.branch.create({
    data: {
      organizationId: org.id,
      code: `OTHER-${suffix}`,
      name: 'Other',
    },
  });
  const foreignBranch = await transaction.branch.create({
    data: {
      organizationId: foreignOrg.id,
      code: `FOREIGN-${suffix}`,
      name: 'Foreign',
    },
  });
  const program = await transaction.program.create({
    data: { organizationId: org.id, code: `P-${suffix}`, name: 'Program' },
  });
  const programVersion = await transaction.programVersion.create({
    data: { organizationId: org.id, programId: program.id, version: 1 },
  });
  const module = await transaction.academicModule.create({
    data: { organizationId: org.id, code: `M-${suffix}`, name: 'Module' },
  });
  const versionModule = await transaction.programVersionModule.create({
    data: {
      organizationId: org.id,
      programVersionId: programVersion.id,
      moduleId: module.id,
      ordinal: 1,
    },
  });
  const cohort = await transaction.cohort.create({
    data: {
      organizationId: org.id,
      programVersionId: programVersion.id,
      owningBranchId: branch.id,
      code: `C-${suffix}`,
    },
  });
  const cohortModule = await transaction.cohortModule.create({
    data: {
      organizationId: org.id,
      cohortId: cohort.id,
      programVersionModuleId: versionModule.id,
      ordinal: 1,
    },
  });
  const room = await transaction.room.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      code: `R-${suffix}`,
      name: 'Room',
    },
  });
  const replacementRoom = await transaction.room.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      code: `R2-${suffix}`,
      name: 'Second Room',
    },
  });
  const otherRoom = await transaction.room.create({
    data: {
      organizationId: org.id,
      branchId: otherBranch.id,
      code: `OR-${suffix}`,
      name: 'Other Room',
    },
  });
  const foreignRoom = await transaction.room.create({
    data: {
      organizationId: foreignOrg.id,
      branchId: foreignBranch.id,
      code: `FR-${suffix}`,
      name: 'Foreign Room',
    },
  });
  async function createUser(name: string) {
    const person = await transaction.person.create({
      data: { organizationId: org.id, publicId: `${name}-${suffix}`, name: name },
    });
    return transaction.user.create({ data: { organizationId: org.id, personId: person.id } });
  }
  async function createTrainer(name: string) {
    const person = await transaction.person.create({
      data: { organizationId: org.id, publicId: `${name}-${suffix}`, name: name },
    });
    return transaction.trainerProfile.create({
      data: { organizationId: org.id, personId: person.id },
    });
  }
  const actor = await createUser('owner');
  const trainer = await createTrainer('trainer-one');
  const replacementTrainer = await createTrainer('trainer-two');
  const foreignPerson = await transaction.person.create({
    data: { organizationId: foreignOrg.id, publicId: `FT-${suffix}`, name: 'Foreign Trainer' },
  });
  const foreignTrainer = await transaction.trainerProfile.create({
    data: { organizationId: foreignOrg.id, personId: foreignPerson.id },
  });
  const prisma = prismaAdapter(transaction);
  const policy = new SessionSchedulePolicyService();
  const audit = new AuditService();
  const outbox = new OutboxService();
  const idempotency = new IdempotencyService();
  return {
    org,
    branch,
    otherBranch,
    cohort,
    cohortModule,
    room,
    replacementRoom,
    otherRoom,
    foreignRoom,
    trainer,
    replacementTrainer,
    foreignTrainer,
    ownerAccess: access(org.id, actor.id, [], ['O']),
    operationsAccess: access(org.id, actor.id, [branch.id], ['B']),
    wrongBranchAccess: access(org.id, actor.id, [otherBranch.id], ['B']),
    deniedAccess: access(org.id, actor.id, [branch.id], []),
    mutations: new AcademicSessionMutationService(prisma, audit, outbox, idempotency, policy),
    lifecycle: new AcademicSessionLifecycleService(prisma, audit, outbox, idempotency, policy),
  };
}
export function sessionInput(
  fixture: Awaited<ReturnType<typeof setupAcademicSessionFixture>>,
  ordinal: number,
  startsAt: Date,
  endsAt: Date,
  overrides: Partial<CreateSessionDto> = {},
): CreateSessionDto {
  return {
    cohortId: fixture.cohort.id,
    cohortModuleId: fixture.cohortModule.id,
    ordinal,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    deliveryMode: 'IN_PERSON',
    ...overrides,
  };
}
