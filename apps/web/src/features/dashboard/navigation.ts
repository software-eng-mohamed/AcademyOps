import {
  type WorkspaceOverviewRole,
  workspaceOverviewRequirements,
} from '@academyops/api-client/workspace-overview';
import type { DashboardUser } from './dashboard-user';
import { navigation } from './navigation-items';
export type DashboardNavigationGroup = 'personal' | 'academy' | 'operations' | 'finance' | 'system';

export type DashboardNavigationKey =
  | 'dashboard'
  | 'myLearning'
  | 'mySchedule'
  | 'myAttendance'
  | 'myFinance'
  | 'myCertificates'
  | 'leads'
  | 'students'
  | 'registrations'
  | 'enrollments'
  | 'programs'
  | 'cohorts'
  | 'resources'
  | 'sessions'
  | 'attendance'
  | 'certificates'
  | 'businessAccounts'
  | 'finance'
  | 'payments'
  | 'documents'
  | 'reports'
  | 'imports'
  | 'audit'
  | 'legacyArchive'
  | 'whatsapp'
  | 'access';

export type DashboardNavigationItem = {
  available: boolean;
  group?: DashboardNavigationGroup;
  href: string;
  key: DashboardNavigationKey;
  match?: 'all' | 'any';
  permissions?: readonly string[];
  roles?: readonly string[];
  scopes?: readonly string[];
};

type NavigationSubject = Pick<DashboardUser, 'permissions' | 'roles'>;

const operationsPages = new Set<DashboardNavigationKey>([
  'students',
  'enrollments',
  'programs',
  'cohorts',
  'resources',
  'sessions',
  'attendance',
  'certificates',
  'businessAccounts',
]);

const academicPages = new Set<DashboardNavigationKey>([
  'students',
  'enrollments',
  'programs',
  'cohorts',
  'resources',
  'sessions',
  'attendance',
  'certificates',
]);

const receptionPages = new Set<DashboardNavigationKey>([
  'leads',
  'students',
  'enrollments',
  'programs',
  'cohorts',
  'resources',
  'sessions',
  'certificates',
  'businessAccounts',
]);

const salesPages = new Set<DashboardNavigationKey>([
  'leads',
  'students',
  'enrollments',
  'programs',
  'cohorts',
  'resources',
  'sessions',
  'businessAccounts',
]);

const accountsPages = new Set<DashboardNavigationKey>([
  'students',
  'enrollments',
  'programs',
  'cohorts',
  'resources',
  'sessions',
  'finance',
  'payments',
  'documents',
]);

const attendancePages = new Set<DashboardNavigationKey>([
  'students',
  'enrollments',
  'programs',
  'cohorts',
  'resources',
  'sessions',
  'attendance',
]);

const trainerPages = new Set<DashboardNavigationKey>([...attendancePages, 'certificates']);

// Page availability is separate from authority. The API still evaluates each
// record's scope; sharing Owner components must never imply Owner permissions.
export function canUseStaffPage(user: NavigationSubject, key: DashboardNavigationKey) {
  const role = getPrimaryRoleCode(user);
  return (
    role === 'OWNER' ||
    (role === 'OPERATIONS' && operationsPages.has(key)) ||
    (role === 'ACADEMIC' && academicPages.has(key)) ||
    (role === 'RECEPTION' && receptionPages.has(key)) ||
    (role === 'SALES' && salesPages.has(key)) ||
    (role === 'ACCOUNTS' && accountsPages.has(key)) ||
    (role === 'ATTENDANCE' && attendancePages.has(key)) ||
    (role === 'TRAINER' && trainerPages.has(key)) ||
    (role === 'OTP_OPERATOR' && key === 'whatsapp')
  );
}

export function staffScopes(user: NavigationSubject): readonly string[] {
  const role = getPrimaryRoleCode(user);
  return role === 'OWNER'
    ? ['O']
    : role === 'TRAINER'
      ? ['A']
      : role === 'SALES'
        ? ['O', 'B', 'A']
        : ['O', 'B'];
}

export function hasStaffPermission(
  user: NavigationSubject,
  code: string,
  scopes = staffScopes(user),
) {
  return hasPermission(user, code, scopes);
}

function hasRole(user: NavigationSubject, allowedRoles: readonly string[]) {
  const roles = new Set(user.roles.map(({ code }) => code.toUpperCase()));
  return allowedRoles.some((role) => roles.has(role));
}

export function hasPermission(user: NavigationSubject, code: string, scopes?: readonly string[]) {
  return user.permissions.some(
    (permission) =>
      permission.code === code &&
      (!scopes || permission.scopes.some((scope) => scopes.includes(scope))),
  );
}

export function getVisibleNavigation(user: NavigationSubject): DashboardNavigationItem[] {
  return navigation
    .filter((item) => {
      if (item.key === 'dashboard') return hasOverviewAccess(user);
      if (!item.permissions && !item.roles) return true;
      if (item.roles && !hasRole(user, item.roles)) return false;
      if (!item.permissions) return true;
      const matches = item.permissions.map((permission) =>
        hasPermission(user, permission, item.scopes),
      );
      return item.match === 'all' ? matches.every(Boolean) : matches.some(Boolean);
    })
    .map((item) =>
      (item.group === 'personal' && getPrimaryRoleCode(user) === 'STUDENT') ||
      ((item.group === 'academy' ||
        item.group === 'operations' ||
        item.group === 'finance' ||
        item.group === 'system') &&
        canUseStaffPage(user, item.key))
        ? { ...item, available: true }
        : item,
    );
}

const rolePriority = [
  'OWNER',
  'OPERATIONS',
  'ACADEMIC',
  'RECEPTION',
  'SALES',
  'ACCOUNTS',
  'ATTENDANCE',
  'TRAINER',
  'STUDENT',
  'OTP_OPERATOR',
] as const;

export type KnownRoleCode = (typeof rolePriority)[number];

export function getPrimaryRoleCode(user: NavigationSubject): KnownRoleCode | undefined {
  const assigned = new Set(user.roles.map(({ code }) => code.toUpperCase()));
  return rolePriority.find((role) => assigned.has(role));
}

export function getWorkspaceOverviewRole(
  user: NavigationSubject,
): WorkspaceOverviewRole | undefined {
  const role = getPrimaryRoleCode(user);
  if (!role || role === 'OWNER' || role === 'SALES') return undefined;
  return workspaceOverviewRequirements[role].every(([permission, scopes]) =>
    hasPermission(user, permission, scopes),
  )
    ? role
    : undefined;
}

export function hasOverviewAccess(user: NavigationSubject): boolean {
  const role = getPrimaryRoleCode(user);
  if (role === 'OWNER') return hasPermission(user, 'reports.operations.read');
  if (role === 'SALES') return hasPermission(user, 'leads.read', ['O', 'B', 'A']);
  return getWorkspaceOverviewRole(user) !== undefined;
}
