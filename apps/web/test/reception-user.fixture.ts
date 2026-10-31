import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';

export const receptionUser: DashboardUser = {
  id: 'reception-test',
  name: 'Reception',
  branches: [{ name: 'Academy' }],
  organization: { name: 'Academy' },
  roles: [{ code: 'RECEPTION', name: 'Reception' }],
  permissions: defaultRoleGrants.RECEPTION.map(([code, scope]) => ({ code, scopes: [scope] })),
};
