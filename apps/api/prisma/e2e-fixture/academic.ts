import type { PrismaClient, Session, TrainerProfile } from '@prisma/client';
import type { AcademicFixture, FixtureContext } from './types';
export interface AcademicSeedResult {
  academics: AcademicFixture[];
  pastSessions: Session[];
  futureSessions: Session[];
  trainer: TrainerProfile;
}
function dateAt(daysFromNow: number, utcHour: number): Date {
  const value = new Date();
  value.setUTCHours(utcHour, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + daysFromNow);
  return value;
}
async function trainer(prisma: PrismaClient, organizationId: string): Promise<TrainerProfile> {
  const person = await prisma.person.upsert({
    where: {
      organizationId_publicId: { organizationId, publicId: 'E2E-TRAINER' },
    },
    update: { name: 'Synthetic Trainer' },
    create: {
      organizationId,
      publicId: 'E2E-TRAINER',
      name: 'Synthetic Trainer',
    },
  });
  return prisma.trainerProfile.upsert({
    where: { organizationId_personId: { organizationId, personId: person.id } },
    update: { status: 'ACTIVE' },
    create: { organizationId, personId: person.id, status: 'ACTIVE' },
  });
}
async function session(
  ctx: FixtureContext,
  academic: AcademicFixture,
  instructor: TrainerProfile,
  ordinal: number,
  startsAt: Date,
  status: 'COMPLETED' | 'SCHEDULED',
): Promise<Session> {
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const value = await ctx.prisma.session.upsert({
    where: {
      organizationId_cohortId_ordinal: {
        organizationId: ctx.organization.id,
        cohortId: academic.cohort.id,
        ordinal,
      },
    },
    update: {},
    create: {
      organizationId: ctx.organization.id,
      cohortModuleId: academic.cohortModule.id,
      cohortId: academic.cohort.id,
      roomId: academic.room.id,
      ordinal,
      startsAt,
      endsAt,
      deliveryMode: 'IN_PERSON',
      status,
      attendanceWindowState: status === 'COMPLETED' ? 'LOCKED' : 'SCHEDULED',
      attendanceLockedAt: status === 'COMPLETED' ? endsAt : null,
    },
  });
  await ctx.prisma.sessionTrainer.upsert({
    where: {
      organizationId_sessionId_trainerId_role: {
        organizationId: ctx.organization.id,
        sessionId: value.id,
        trainerId: instructor.id,
        role: 'PRIMARY',
      },
    },
    update: {},
    create: {
      organizationId: ctx.organization.id,
      sessionId: value.id,
      trainerId: instructor.id,
      startsAt,
      endsAt,
      role: 'PRIMARY',
      bookingStatus: 'CONFIRMED',
    },
  });
  return value;
}
async function course(ctx: FixtureContext, index: number): Promise<AcademicFixture> {
  const suffix = index + 1;
  const code = `E2E-COURSE-${suffix}`;
  const program = await ctx.prisma.program.upsert({
    where: { organizationId_code: { organizationId: ctx.organization.id, code } },
    update: {
      name: `Synthetic Course ${suffix}`,
      status: 'ACTIVE',
    },
    create: {
      organizationId: ctx.organization.id,
      code,
      name: `Synthetic Course ${suffix}`,
      status: 'ACTIVE',
    },
  });
  let version = await ctx.prisma.programVersion.upsert({
    where: {
      organizationId_programId_version: {
        organizationId: ctx.organization.id,
        programId: program.id,
        version: 1,
      },
    },
    update: {},
    create: {
      organizationId: ctx.organization.id,
      programId: program.id,
      version: 1,
      status: 'DRAFT',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    },
  });
  const module = await ctx.prisma.academicModule.upsert({
    where: {
      organizationId_code: { organizationId: ctx.organization.id, code: `${code}-MODULE` },
    },
    update: { name: `Synthetic Module ${suffix}` },
    create: {
      organizationId: ctx.organization.id,
      code: `${code}-MODULE`,
      name: `Synthetic Module ${suffix}`,
    },
  });
  const versionModule = await ctx.prisma.programVersionModule.upsert({
    where: {
      organizationId_programVersionId_moduleId: {
        organizationId: ctx.organization.id,
        programVersionId: version.id,
        moduleId: module.id,
      },
    },
    update: {},
    create: {
      organizationId: ctx.organization.id,
      programVersionId: version.id,
      moduleId: module.id,
      ordinal: 1,
    },
  });
  if (version.status === 'DRAFT') {
    version = await ctx.prisma.programVersion.update({
      where: { id: version.id },
      data: { status: 'PUBLISHED' },
    });
  }
  let cohort = await ctx.prisma.cohort.upsert({
    where: {
      organizationId_code: { organizationId: ctx.organization.id, code: `${code}-COHORT` },
    },
    update: { owningBranchId: ctx.branch.id },
    create: {
      organizationId: ctx.organization.id,
      programVersionId: version.id,
      owningBranchId: ctx.branch.id,
      code: `${code}-COHORT`,
      name: `Synthetic Cohort ${suffix}`,
      status: 'DRAFT',
      startsOn: dateAt(-30, 0),
      capacity: 25,
    },
  });
  if (cohort.status === 'DRAFT') {
    cohort = await ctx.prisma.cohort.update({
      where: { id: cohort.id },
      data: { status: 'PLANNED' },
    });
  }
  if (cohort.status === 'PLANNED') {
    cohort = await ctx.prisma.cohort.update({
      where: { id: cohort.id },
      data: { status: 'ACTIVE' },
    });
  }
  const cohortModule = await ctx.prisma.cohortModule.upsert({
    where: {
      organizationId_cohortId_programVersionModuleId: {
        organizationId: ctx.organization.id,
        cohortId: cohort.id,
        programVersionModuleId: versionModule.id,
      },
    },
    update: {},
    create: {
      organizationId: ctx.organization.id,
      cohortId: cohort.id,
      programVersionModuleId: versionModule.id,
      ordinal: 1,
    },
  });
  const room = await ctx.prisma.room.upsert({
    where: {
      organizationId_branchId_code: {
        organizationId: ctx.organization.id,
        branchId: ctx.branch.id,
        code: `ROOM-${suffix}`,
      },
    },
    update: { capacity: 30, isActive: true },
    create: {
      organizationId: ctx.organization.id,
      branchId: ctx.branch.id,
      code: `ROOM-${suffix}`,
      name: `Synthetic Room ${suffix}`,
      capacity: 30,
    },
  });
  return { version, cohort, cohortModule, room };
}
export async function seedAcademic(ctx: FixtureContext): Promise<AcademicSeedResult> {
  const academics = await Promise.all([course(ctx, 0), course(ctx, 1)]);
  const instructor = await trainer(ctx.prisma, ctx.organization.id);
  const pastSessions: Session[] = [];
  const futureSessions: Session[] = [];
  for (const [index, academic] of academics.entries()) {
    const hour = 8 + index * 3;
    pastSessions.push(await session(ctx, academic, instructor, 1, dateAt(-7, hour), 'COMPLETED'));
    pastSessions.push(await session(ctx, academic, instructor, 2, dateAt(-2, hour), 'COMPLETED'));
    futureSessions.push(await session(ctx, academic, instructor, 3, dateAt(3, hour), 'SCHEDULED'));
  }
  return { academics, pastSessions, futureSessions, trainer: instructor };
}
