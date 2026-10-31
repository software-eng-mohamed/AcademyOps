// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { DEMO_EMAIL, DEMO_ORGANIZATION, DEMO_PASSWORD } from '@/api/demo/credentials';
import { handleDemoRequest } from '@/api/demo/router';
import { publicDemoRequest } from '@/api/server/demo-request';

describe('demo route public origin', () => {
  const body = JSON.stringify({
    identifier: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    organizationCode: DEMO_ORGANIZATION,
  });
  it('preserves POST bodies and accepts a matching browser origin behind the Next adapter', async () => {
    const request = new Request('http://localhost:3175/api/v1/auth/login', {
      method: 'POST',
      body,
      headers: {
        Host: '127.0.0.1:3175',
        Origin: 'http://127.0.0.1:3175',
        'Content-Type': 'application/json',
      },
    });
    const normalized = publicDemoRequest(request);
    expect(normalized.url).toBe('http://127.0.0.1:3175/api/v1/auth/login');
    expect((await handleDemoRequest(normalized)).status).toBe(201);
  });
  it('uses the forwarded HTTPS scheme for production links', () => {
    const request = new Request('http://localhost:3000/api/v1/certificates', {
      headers: { Host: 'academyops-demo.vercel.app', 'X-Forwarded-Proto': 'https' },
    });
    expect(publicDemoRequest(request).url).toBe(
      'https://academyops-demo.vercel.app/api/v1/certificates',
    );
  });
  it('still rejects cross-origin mutations', async () => {
    const request = new Request('http://localhost:3175/api/v1/auth/login', {
      method: 'POST',
      body,
      headers: {
        Host: '127.0.0.1:3175',
        Origin: 'https://unrelated.example',
        'Content-Type': 'application/json',
      },
    });
    expect((await handleDemoRequest(publicDemoRequest(request))).status).toBe(403);
  });
});
