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
  const demoOnly = process.env.ACADEMYOPS_DEMO_ONLY === 'true';
  const baseUrl = demoOnly ? 'https://academyops.demo' : resolveApiOrigin();
  const transport = new PlgHttpTransport({
    baseUrl,
    cookie: cookieStore.toString(),
    ...(demoOnly
      ? {
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const { handleDemoRequest } = await import('@/api/demo/router');
            return handleDemoRequest(new Request(input, init));
          },
        }
      : {}),
    timeoutMs: 10_000,
  });
  return createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: (request: Request) => transport.fetch(request),
  });
}
