import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { defaultRoleGrants } from '../../../packages/contracts/src/roles';

export const trainerUser: DashboardUser = {
  id: 'trainer-test',
  name: 'Trainer',
  branches: [{ name: 'Academy' }],
  organization: { name: 'Academy' },
  roles: [{ code: 'TRAINER', name: 'Trainer' }],
  permissions: defaultRoleGrants.TRAINER.map(([code, scope]) => ({ code, scopes: [scope] })),
};
