import type { CurrentUserSummaryDto } from '@/api/generated/models/currentUserSummaryDto';

export type DashboardUser = {
  id: string;
  branches: Array<{ name: string }>;
  name: string;
  organization: { name: string };
  permissions: CurrentUserSummaryDto['permissions'];
  roles: CurrentUserSummaryDto['roles'];
};
