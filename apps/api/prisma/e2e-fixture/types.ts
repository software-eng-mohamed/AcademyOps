import type {
  Branch,
  Cohort,
  CohortModule,
  Enrollment,
  Organization,
  PrismaClient,
  ProgramVersion,
  Room,
  User,
} from '@prisma/client';
import type { FixtureRole } from './constants';

export interface FixtureAccountSecret {
  email: string;
  password: string;
  totpSecret?: string;
}

export interface FixtureArtifact {
  marker: string;
  version: 1;
  organizationCode: string;
  generatedAt: string;
  accounts: Record<FixtureRole, FixtureAccountSecret>;
}

export interface FixtureContext {
  prisma: PrismaClient;
  organization: Organization;
  branch: Branch;
  users: Record<FixtureRole, User>;
}

export interface AcademicFixture {
  version: ProgramVersion;
  cohort: Cohort;
  cohortModule: CohortModule;
  room: Room;
}

export interface StudentFixture {
  enrollment: Enrollment;
  academic: AcademicFixture;
}
