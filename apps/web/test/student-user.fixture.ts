import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';
export const studentUser: DashboardUser = {
  id: 'student-test',
  name: 'Student',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'STUDENT', name: 'Student' }],
  permissions: defaultRoleGrants.STUDENT.map(([code, scope]) => ({ code, scopes: [scope] })),
};
