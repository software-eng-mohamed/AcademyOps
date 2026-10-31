import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { seedAcademicResources } from './seed-ui-demo/academic';
import { seedAuditEvents } from './seed-ui-demo/audit';
import { seedFacilitiesAndTrainer } from './seed-ui-demo/facilities-trainer';
import { seedOrgAndStaff } from './seed-ui-demo/org-staff';
import { seedSessionsAndAttendance } from './seed-ui-demo/sessions-attendance';
import { seedStudentsAndFinance } from './seed-ui-demo/students-finance';

config({ path: resolve(__dirname, '../../../.env') });

if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEVELOPMENT_FIXTURES !== 'true') {
  throw new Error(
    'Development fixtures are disabled. Set ENABLE_DEVELOPMENT_FIXTURES=true outside production.',
  );
}

const prisma = new PrismaClient();

async function main() {
  const ctx = { prisma };
  const orgStaff = await seedOrgAndStaff(ctx);
  const academic = await seedAcademicResources(ctx, orgStaff);
  const facilitiesTrainer = await seedFacilitiesAndTrainer(ctx, {
    organization: orgStaff.organization,
    cohorts: academic.cohorts,
  });
  const studentsFinance = await seedStudentsAndFinance(ctx, {
    organization: orgStaff.organization,
    mainBranch: orgStaff.mainBranch,
    eastBranch: orgStaff.eastBranch,
    version: academic.version,
    cohorts: academic.cohorts.map((item) => item.cohort),
    demoUser: orgStaff.demoUser,
  });
  await seedSessionsAndAttendance(ctx, {
    organization: orgStaff.organization,
    cohorts: academic.cohorts,
    rooms: facilitiesTrainer.rooms,
    trainer: facilitiesTrainer.trainer,
    enrollments: studentsFinance.enrollments,
    demoUser: orgStaff.demoUser,
  });
  await seedAuditEvents(ctx, {
    organization: orgStaff.organization,
    demoUser: orgStaff.demoUser,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
