import 'server-only';

import type { ResponseDashboardControllerOverviewResponse } from '@/api/generated/models/responseDashboardControllerOverviewResponse';
import { createServerApiClient } from './client';

export async function readDashboardOverview(): Promise<ResponseDashboardControllerOverviewResponse> {
  const client = await createServerApiClient();
  const { data, response } = await client.GET('/api/v1/dashboard/overview');
  if (!data) {
    throw new Error(`Dashboard overview request failed with status ${response.status}`);
  }
  return data;
}
