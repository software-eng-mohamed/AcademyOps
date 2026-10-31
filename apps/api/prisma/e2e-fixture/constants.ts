export const FIXTURE_MARKER = 'plg-synthetic-e2e-v1';
export const FIXTURE_ORGANIZATION_CODE = 'E2EACADEMY';
export const FIXTURE_ORGANIZATION_NAME = '[SYNTHETIC E2E] AcademyOps';
export const CLEAN_CONFIRMATION = `delete-${FIXTURE_ORGANIZATION_CODE}`;

export const FIXTURE_ROLES = [
  'owner',
  'operations',
  'academic',
  'reception',
  'sales',
  'accounts',
  'attendance',
  'trainer',
  'student',
  'otp_operator',
  'no_grant',
  'first_login',
] as const;

export type FixtureRole = (typeof FIXTURE_ROLES)[number];

export const ROLE_CODES = {
  owner: 'OWNER',
  operations: 'OPERATIONS',
  academic: 'ACADEMIC',
  reception: 'RECEPTION',
  sales: 'SALES',
  accounts: 'ACCOUNTS',
  attendance: 'ATTENDANCE',
  trainer: 'TRAINER',
  student: 'STUDENT',
  otp_operator: 'OTP_OPERATOR',
  no_grant: null,
  first_login: 'OPERATIONS',
} as const;

export const MFA_ROLES = new Set<FixtureRole>([
  'owner',
  'operations',
  'academic',
  'reception',
  'sales',
  'accounts',
  'attendance',
  'trainer',
  'otp_operator',
  'first_login',
]);
