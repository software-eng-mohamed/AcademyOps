import { PrismaClient } from '@prisma/client';
import { cleanLoadFixture } from './load-fixture/cleanup';
import { seedLoadFixture } from './load-fixture/seed';
import { verifyLoadFixture } from './load-fixture/verify';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'seed') return seedLoadFixture(prisma);
  if (command === 'verify') return verifyLoadFixture(prisma);
  if (command === 'clean') return cleanLoadFixture(prisma);
  throw new Error('Usage: load-fixture.ts <seed|verify|clean>');
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Load fixture command failed.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
