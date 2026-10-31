export const LOAD_SUBJECT_COUNT = 10_500;
export const LOAD_PERSON_PREFIX = 'LOAD-';
export const LOAD_ARTIFACT_MARKER = 'plg-synthetic-load-sessions-v1';
export const E2E_FIXTURE_MARKER = 'plg-synthetic-e2e-v1';
export const E2E_ORGANIZATION_CODE = 'E2EACADEMY';
export const E2E_ORGANIZATION_NAME = '[SYNTHETIC E2E] AcademyOps';
export const LOAD_ROLES = ['student', 'attendance', 'accounts', 'owner'] as const;
export type LoadRole = (typeof LOAD_ROLES)[number];

export const ROLE_CODES: Record<LoadRole, string> = {
  student: 'STUDENT',
  attendance: 'ATTENDANCE',
  accounts: 'ACCOUNTS',
  owner: 'OWNER',
};

export const SEED_CONFIRMATION = 'seed-10500-E2EACADEMY';
export const CLEAN_CONFIRMATION = 'delete-10500-E2EACADEMY';
export const DATABASE_CONFIRMATION = 'disposable-load-database';
