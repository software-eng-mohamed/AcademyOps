import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission } from '@/features/dashboard/navigation';

export type SystemSection = 'access' | 'imports' | 'audit' | 'legacyArchive' | 'whatsapp';
export type SystemResource = 'users' | 'roles' | 'branches' | 'imports' | 'audit' | 'legacyArchive';
export type SystemRecord = Record<string, unknown> & { id: string };
export const systemPermissions = {
  users: 'users.manage',
  roles: 'roles.manage',
  branches: 'branches.manage',
  imports: 'imports.preview',
  audit: 'audit.read',
  legacyArchive: 'legacy_archive.read',
  whatsapp: 'messaging.otp.read',
} as const;
export function systemResources(
  section: Exclude<SystemSection, 'whatsapp'>,
  user: DashboardUser,
): SystemResource[] {
  const resources: SystemResource[] = section === 'access' ? ['users', 'roles'] : [section];
  return resources.filter((resource) => hasPermission(user, systemPermissions[resource], ['O']));
}
export const systemColumns: Record<SystemResource, string[]> = {
  users: ['email', 'status', 'roles'],
  roles: ['code', 'isSystem', 'createdAt'],
  branches: ['code', 'isActive', 'createdAt'],
  imports: ['status', 'createdAt', 'finalizedAt'],
  audit: ['action', 'entityType', 'actor.name', 'createdAt'],
  legacyArchive: ['category', 'sheetName', 'rowNumber', 'createdAt'],
};
export const systemStatuses: Partial<Record<SystemResource, string[]>> = {
  users: ['PENDING', 'ACTIVE', 'SUSPENDED'],
  imports: ['STAGED', 'VALIDATED', 'RECONCILED', 'FINALIZED'],
};
