import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';

export const attendanceUser: DashboardUser = {
  id: 'attendance-test',
  name: 'Attendance',
  branches: [{ name: 'Academy' }],
  organization: { name: 'Academy' },
  roles: [{ code: 'ATTENDANCE', name: 'Attendance' }],
  permissions: defaultRoleGrants.ATTENDANCE.map(([code, scope]) => ({ code, scopes: [scope] })),
};
