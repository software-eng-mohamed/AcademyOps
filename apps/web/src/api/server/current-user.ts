import 'server-only';

import { cache } from 'react';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { createServerApiClient } from './client';

export const readCurrentUser = cache(async (): Promise<DashboardUser | null> => {
  try {
    const client = await createServerApiClient();
    const { data, response } = await client.GET('/api/v1/auth/me');

    if (response.status === 401) return null;
    if (!data) {
      return null;
    }
    return {
      id: data.id,
      branches: data.branches.map(({ name }) => ({ name })),
      name: data.name,
      organization: { name: data.organization.name },
      permissions: data.permissions,
      roles: data.roles,
    };
  } catch {
    // Return null on network error, connection failure, or unauthenticated session
    return null;
  }
});
