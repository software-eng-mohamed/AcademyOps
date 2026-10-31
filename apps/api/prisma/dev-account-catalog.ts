import type { DefaultRoleCode } from '@academyops/contracts';

export const organizationCode = 'ACADEMYOPS';
export const defaultPassword = 'AcademyOps-Local#2026!';
export type DevAccount = {
  email: string;
  name: string;
  role: DefaultRoleCode | null;
};
export const accounts: readonly DevAccount[] = [
  { email: 'owner@academyops.local', name: 'Development Owner', role: 'OWNER' },
  {
    email: 'operations@academyops.local',
    name: 'Development Operations',
    role: 'OPERATIONS',
  },
  {
    email: 'academic@academyops.local',
    name: 'Development Academic',
    role: 'ACADEMIC',
  },
  {
    email: 'reception@academyops.local',
    name: 'Development Reception',
    role: 'RECEPTION',
  },
  {
    email: 'sales@academyops.local',
    name: 'Development Sales',
    role: 'SALES',
  },
  {
    email: 'accounts@academyops.local',
    name: 'Development Accounts',
    role: 'ACCOUNTS',
  },
  {
    email: 'attendance@academyops.local',
    name: 'Development Attendance',
    role: 'ATTENDANCE',
  },
  {
    email: 'trainer@academyops.local',
    name: 'Development Trainer',
    role: 'TRAINER',
  },
  {
    email: 'student@academyops.local',
    name: 'Development Student',
    role: 'STUDENT',
  },
  {
    email: 'otp-operator@academyops.local',
    name: 'Development WhatsApp OTP Operator',
    role: 'OTP_OPERATOR',
  },
  {
    email: 'no-grant@academyops.local',
    name: 'Development User Without Grants',
    role: null,
  },
] as const;
export function publicId(account: DevAccount): string {
  return `DEV-${account.email
    .split('@')[0]!
    .replace(/[^a-z0-9]+/g, '-')
    .toUpperCase()}`;
}
export function requiresMfa(account: DevAccount): boolean {
  return account.role !== null && account.role !== 'STUDENT';
}
