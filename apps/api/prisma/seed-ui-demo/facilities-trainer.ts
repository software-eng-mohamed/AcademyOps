import type { Organization } from '@prisma/client';
import type { CohortWithDetails, FacilitiesAndTrainerResult, SeedUiDemoContext } from './types';
export async function seedFacilitiesAndTrainer(
  ctx: SeedUiDemoContext,
  input: {
    organization: Organization;
    cohorts: CohortWithDetails[];
  },
): Promise<FacilitiesAndTrainerResult> {
  const { prisma } = ctx;
  const { organization, cohorts } = input;
  const rooms = [];
  for (const { branch } of cohorts) {
    rooms.push(
      await prisma.room.upsert({
        where: {
          organizationId_branchId_code: {
            organizationId: organization.id,
            branchId: branch.id,
            code: 'ROOM-A',
          },
        },
        update: { capacity: 30 },
        create: {
          organizationId: organization.id,
          branchId: branch.id,
          code: 'ROOM-A',
          name: 'Training Room A',
          capacity: 30,
        },
      }),
    );
  }
  const trainerPerson = await prisma.person.upsert({
    where: {
      organizationId_publicId: { organizationId: organization.id, publicId: 'UI-TRAINER-001' },
    },
    update: { name: 'Dr. Mariam Hassan' },
    create: {
      organizationId: organization.id,
      publicId: 'UI-TRAINER-001',
      name: 'Dr. Mariam Hassan',
    },
  });
  const trainer = await prisma.trainerProfile.upsert({
    where: {
      organizationId_personId: { organizationId: organization.id, personId: trainerPerson.id },
    },
    update: { status: 'ACTIVE' },
    create: { organizationId: organization.id, personId: trainerPerson.id, status: 'ACTIVE' },
  });
  return { rooms, trainer };
}
