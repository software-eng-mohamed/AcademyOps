import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';

export const accountsUser: DashboardUser = {
  id: 'accounts-test',
  name: 'Accounts',
  branches: [{ name: 'Academy' }],
  organization: { name: 'Academy' },
  roles: [{ code: 'ACCOUNTS', name: 'Accounts' }],
  permissions: defaultRoleGrants.ACCOUNTS.map(([code, scope]) => ({ code, scopes: [scope] })),
};
