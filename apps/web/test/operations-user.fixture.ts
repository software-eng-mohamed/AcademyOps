import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';
export const operationsUser: DashboardUser = {
  id: 'operations-test',
  name: 'Operations',
  branches: [{ name: 'Academy' }],
  organization: { name: 'Academy' },
  roles: [{ code: 'OPERATIONS', name: 'Operations' }],
  permissions: defaultRoleGrants.OPERATIONS.map(([code, scope]) => ({ code, scopes: [scope] })),
};
