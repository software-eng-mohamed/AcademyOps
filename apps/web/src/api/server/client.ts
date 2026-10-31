import 'server-only';

import { PlgHttpTransport } from '@academyops/api-client/http';
import type { paths } from '@academyops/api-client/openapi';
import { cookies } from 'next/headers';
import createClient from 'openapi-fetch';
import { resolveApiOrigin } from './environment';

export async function createServerApiClient() {
  const cookieStore = await cookies();
  // The OpenAPI contract contains absolute application paths such as
  // `/api/v1/auth/me`, so the client base must be the origin only.
  const baseUrl = resolveApiOrigin();
  const transport = new PlgHttpTransport({
    baseUrl,
    cookie: cookieStore.toString(),
    timeoutMs: 10_000,
  });
  return createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: (request: Request) => transport.fetch(request),
  });
}
