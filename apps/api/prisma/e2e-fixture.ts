import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { seedAcademic } from './e2e-fixture/academic';
import { seedAttendance } from './e2e-fixture/attendance';
import { cleanupSummary, cleanFixture } from './e2e-fixture/cleanup';
import { ARTIFACT_PATH, loadOrCreateArtifact, writeArtifact } from './e2e-fixture/credentials';
import { seedIdentity } from './e2e-fixture/iam';
import { assertCleanupIntent, assertSyntheticIntent } from './e2e-fixture/safety';
import { seedStudentFinance } from './e2e-fixture/student-finance';
import { verifyFixture } from './e2e-fixture/verify';

config();

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  assertSyntheticIntent();
  const artifact = await loadOrCreateArtifact();
  const identity = await seedIdentity(prisma, artifact, process.env.MFA_ENCRYPTION_KEY!);
  const ctx = { prisma, ...identity };
  const academic = await seedAcademic(ctx);
  const students = await seedStudentFinance(ctx, academic.academics);
  await seedAttendance(ctx, academic.pastSessions, students);
  const counts = await verifyFixture(prisma);
  await writeArtifact(artifact);
  console.log(`Synthetic E2E fixture ready: ${JSON.stringify(counts)}.`);
  console.log(`Credential artifact written with owner-only permissions: ${ARTIFACT_PATH}`);
}

async function verify(): Promise<void> {
  assertSyntheticIntent();
  console.log(`Synthetic E2E fixture verified: ${JSON.stringify(await verifyFixture(prisma))}.`);
}

async function clean(): Promise<void> {
  assertCleanupIntent();
  console.log(cleanupSummary(await cleanFixture(prisma)));
}

async function main(): Promise<void> {
  const action = process.argv[2];
  if (action === 'seed') return seed();
  if (action === 'verify') return verify();
  if (action === 'clean') return clean();
  throw new Error('Usage: e2e-fixture.ts <seed|verify|clean>');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Synthetic fixture command failed.');
    await prisma.$disconnect();
    process.exitCode = 1;
  });
