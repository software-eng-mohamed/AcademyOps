import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';

export const otpUser: DashboardUser = {
  id: 'otp-test',
  name: 'OTP Operator',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'OTP_OPERATOR', name: 'OTP Operator' }],
  permissions: defaultRoleGrants.OTP_OPERATOR.map(([code, scope]) => ({ code, scopes: [scope] })),
};
