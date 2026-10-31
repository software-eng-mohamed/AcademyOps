import type {
  AcademicModule,
  Branch,
  Cohort,
  CohortModule,
  Enrollment,
  Organization,
  Program,
  ProgramVersion,
  ProgramVersionModule,
  PrismaClient,
  Room,
  TrainerProfile,
  User,
} from '@prisma/client';

export interface SeedUiDemoContext {
  prisma: PrismaClient;
}

export interface OrgAndStaffResult {
  organization: Organization;
  mainBranch: Branch;
  eastBranch: Branch;
  demoUser: User;
}

export interface CohortWithDetails {
  cohort: Cohort;
  cohortModule: CohortModule;
  branch: Branch;
}

export interface AcademicResourcesResult {
  program: Program;
  version: ProgramVersion;
  module: AcademicModule;
  versionModule: ProgramVersionModule;
  cohorts: CohortWithDetails[];
}

export interface FacilitiesAndTrainerResult {
  rooms: Room[];
  trainer: TrainerProfile;
}

export interface StudentsAndFinanceResult {
  enrollments: Enrollment[];
}
