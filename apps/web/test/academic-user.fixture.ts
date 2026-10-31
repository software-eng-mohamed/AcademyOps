import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';

export const academicUser: DashboardUser = {
  id: 'academic-test',
  name: 'Academic',
  branches: [{ name: 'Academy' }],
  organization: { name: 'Academy' },
  roles: [{ code: 'ACADEMIC', name: 'Academic' }],
  permissions: defaultRoleGrants.ACADEMIC.map(([code, scope]) => ({ code, scopes: [scope] })),
};
