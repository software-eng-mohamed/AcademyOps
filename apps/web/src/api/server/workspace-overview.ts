import 'server-only';

import { isPlgApiError } from '@academyops/api-client/http';
import type {
  WorkspaceOverview,
  WorkspaceOverviewRole,
} from '@academyops/api-client/workspace-overview';
import { createServerApiClient } from './client';

export async function readWorkspaceOverview(
  role: WorkspaceOverviewRole,
): Promise<WorkspaceOverview | null> {
  try {
    const client = await createServerApiClient();
    const { data } = await client.GET('/api/v1/dashboard/workspaces/{role}', {
      params: { path: { role } },
    });
    return data ?? null;
  } catch (error) {
    if (isPlgApiError(error)) return null;
    throw error;
  }
}
