import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';

export const salesUser: DashboardUser = {
  id: 'sales-test',
  name: 'Sales',
  branches: [{ name: 'Academy' }],
  organization: { name: 'Academy' },
  roles: [{ code: 'SALES', name: 'Sales' }],
  permissions: defaultRoleGrants.SALES.map(([code, scope]) => ({ code, scopes: [scope] })),
};
