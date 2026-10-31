import 'server-only';

import { isPlgApiError } from '@academyops/api-client/http';
import { createServerApiClient } from './client';

export async function readSalesOverview() {
  const client = await createServerApiClient();
  try {
    const { data } = await client.GET('/api/v1/dashboard/sales');
    // A failed read is not an empty pipeline. The client renders retry/error state.
    return data ?? null;
  } catch (error) {
    if (isPlgApiError(error)) return null;
    throw error;
  }
}
