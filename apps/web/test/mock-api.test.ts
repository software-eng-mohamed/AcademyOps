import { describe, expect, it } from 'vitest';
import { DEMO_COOKIE, MAX_DEMO_COOKIE } from '@/api/demo/cookie-state';
import { DEMO_EMAIL, DEMO_ORGANIZATION, DEMO_PASSWORD } from '@/api/demo/credentials';
import { handleDemoRequest } from '@/api/demo/router';
import { demoId, object, string, timestamp } from '@/api/demo/shared';

const origin = 'https://academyops.example';
function request(
  path: string,
  cookie = '',
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}/api/v1/${path}`, {
    method,
    headers: {
      cookie,
      origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function cookieFrom(response: Response) {
  return (
    response.headers
      .getSetCookie()
      .find((item) => item.startsWith(`${DEMO_COOKIE}=`))
      ?.split(';')[0] ?? ''
  );
}
async function login() {
  const response = await handleDemoRequest(
    request('auth/login', '', 'POST', {
      identifier: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      organizationCode: DEMO_ORGANIZATION,
    }),
  );
  expect(response.status).toBe(201);
  return cookieFrom(response);
}

describe('original interface synthetic API', () => {
  it('requires the public sample credentials and never writes cookies on reads', async () => {
    expect((await handleDemoRequest(request('auth/me'))).status).toBe(401);
    const denied = await handleDemoRequest(
      request('auth/login', '', 'POST', {
        identifier: DEMO_EMAIL,
        password: 'incorrect',
        organizationCode: DEMO_ORGANIZATION,
      }),
    );
    expect(denied.status).toBe(401);
    expect(denied.headers.get('set-cookie')).toBeNull();
    const cookie = await login();
    const me = await handleDemoRequest(request('auth/me', cookie));
    expect(me.status).toBe(200);
    expect(me.headers.get('set-cookie')).toBeNull();
    expect(await me.json()).toMatchObject({
      name: 'Demo Owner',
      organization: { code: 'ACADEMYOPS' },
    });
    const dashboard = await handleDemoRequest(request('dashboard/overview', cookie));
    expect(dashboard.status).toBe(200);
    expect(dashboard.headers.get('set-cookie')).toBeNull();
    const overview = object(await dashboard.json());
    expect(overview).toMatchObject({
      kpis: { activeStudents: 12, currencyCode: 'EGP' },
    });
    expect(overview.todaySessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          program: expect.objectContaining({ name: 'Full Stack Development' }),
        }),
      ]),
    );
    expect(object(overview.attention).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ context: { studentName: 'Youssef Amin' } }),
      ]),
    );
  });

  it('rejects malformed or oversized state without crashing or trusting its login flag', async () => {
    const invalidCookies = [
      `${DEMO_COOKIE}=not-base64!`,
      `${DEMO_COOKIE}=${'x'.repeat(MAX_DEMO_COOKIE + 1)}`,
      `${DEMO_COOKIE}=${btoa(JSON.stringify({ v: 1, a: true, l: 'en', e: [{ m: 'GET', p: 'auth/me', b: {} }] }))}`,
      `${DEMO_COOKIE}=${btoa('{"v":1,"a":true,"l":"en","e":[{"m":"POST","p":"students","b":{"__proto__":{"polluted":true}}}]}')}`,
    ];
    for (const cookie of invalidCookies) {
      const response = await handleDemoRequest(request('auth/me', cookie));
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  });

  it('persists manual attendance for one visitor and restores the seed on reset', async () => {
    const original = await login();
    const path = `sessions/${demoId(1003)}/attendance`;
    const changed = await handleDemoRequest(
      request(
        `${path}/manual`,
        original,
        'POST',
        {
          enrollmentId: demoId(309),
          status: 'PRESENT',
          reason: 'Synthetic attendance exercise',
        },
        { 'Idempotency-Key': 'demo-attendance-1' },
      ),
    );
    expect(changed.status).toBe(201);
    const cookie = cookieFrom(changed);
    const getStatus = async (value: string) => {
      const response = await handleDemoRequest(request(path, value));
      const page = (await response.json()) as {
        items: { enrollmentId: string; effectiveStatus: string }[];
      };
      return page.items.find((item) => item.enrollmentId === demoId(309))?.effectiveStatus;
    };
    expect(await getStatus(cookie)).toBe('PRESENT');
    expect(await getStatus(original)).toBe('UNMARKED');
    const reset = await handleDemoRequest(request('demo/reset', cookie, 'POST'));
    expect(reset.status).toBe(200);
    expect(await getStatus(cookieFrom(reset))).toBe('UNMARKED');
    expect((await handleDemoRequest(request('auth/me', cookieFrom(reset)))).status).toBe(200);
  });

  it('replays a posted payment consistently, enforces balance and deduplicates retries', async () => {
    let cookie = await login();
    const enrollmentId = demoId(302);
    const body = {
      billingAccountId: demoId(2002),
      enrollmentId,
      methodId: demoId(2090),
      amount: '500.00',
      receivedAt: new Date().toISOString(),
      externalReference: 'DEMO-TEST',
    };
    const created = await handleDemoRequest(
      request('payments', cookie, 'POST', body, { 'Idempotency-Key': 'demo-payment-1' }),
    );
    expect(created.status).toBe(201);
    const payment = object(await created.json());
    cookie = cookieFrom(created);
    const duplicate = await handleDemoRequest(
      request('payments', cookie, 'POST', body, { 'Idempotency-Key': 'demo-payment-1' }),
    );
    expect(await duplicate.json()).toMatchObject({ id: payment.id });
    expect(duplicate.headers.get('set-cookie')).toBeNull();
    const posted = await handleDemoRequest(
      request(`payments/${string(payment.id)}/post`, cookie, 'POST', undefined, {
        'If-Match': '1',
      }),
    );
    expect(posted.status).toBe(201);
    cookie = cookieFrom(posted);
    const balance = await handleDemoRequest(
      request(`enrollments/${enrollmentId}/finance-summary`, cookie),
    );
    expect(await balance.json()).toMatchObject({ balance: '1000.00', totalCredits: '2000.00' });
    const invoice = await handleDemoRequest(request(`invoices/${demoId(2302)}`, cookie));
    expect(await invoice.json()).toMatchObject({
      settledAmount: '2000.00',
      paymentStatus: 'PARTIALLY_PAID',
    });
    const excessive = await handleDemoRequest(
      request('payments', cookie, 'POST', { ...body, amount: '1000.01' }),
    );
    expect(excessive.status).toBe(409);
    expect(excessive.headers.get('set-cookie')).toBeNull();
  });

  it('keeps mutation cookies HttpOnly and bounded and fails explicitly at capacity', async () => {
    let cookie = await login();
    let reachedLimit = false;
    for (let index = 0; index < 30; index += 1) {
      const response = await handleDemoRequest(request('notifications/read-all', cookie, 'POST'));
      if (response.status === 409) {
        expect(await response.json()).toMatchObject({ code: 'DEMO_STORAGE_LIMIT' });
        expect(response.headers.get('set-cookie')).toBeNull();
        reachedLimit = true;
        break;
      }
      expect(response.status).toBe(204);
      const stateCookie = response.headers
        .getSetCookie()
        .find((item) => item.startsWith(`${DEMO_COOKIE}=`));
      expect(stateCookie).toContain('HttpOnly');
      expect(stateCookie).toContain('SameSite=Lax');
      cookie = cookieFrom(response);
      expect(cookie.length - DEMO_COOKIE.length - 1).toBeLessThanOrEqual(MAX_DEMO_COOKIE);
    }
    expect(reachedLimit).toBe(true);
    expect((await handleDemoRequest(request('auth/me', cookie))).status).toBe(200);
  });

  it('persists session bookings and rejects overlapping room/cohort assignments', async () => {
    const cookie = await login();
    const created = await handleDemoRequest(
      request('sessions', cookie, 'POST', {
        cohortId: demoId(150),
        cohortModuleId: demoId(550),
        roomId: demoId(160),
        ordinal: 30,
        deliveryMode: 'IN_PERSON',
        startsAt: timestamp(4, 10),
        endsAt: timestamp(4, 12),
        trainers: [{ trainerId: demoId(170), role: 'PRIMARY' }],
      }),
    );
    expect(created.status).toBe(201);
    const session = object(await created.json());
    const storedCookie = cookieFrom(created);
    const stored = await handleDemoRequest(request(`sessions/${string(session.id)}`, storedCookie));
    expect(await stored.json()).toMatchObject({
      roomId: demoId(160),
      trainers: [{ trainerId: demoId(170), role: 'PRIMARY' }],
    });
    const conflicting = await handleDemoRequest(
      request(
        `sessions/${string(session.id)}/reschedule`,
        storedCookie,
        'POST',
        {
          startsAt: timestamp(0, 8),
          endsAt: timestamp(0, 10),
          reason: 'Synthetic conflict exercise',
        },
        { 'If-Match': '1' },
      ),
    );
    expect(conflicting.status).toBe(409);
    expect(await conflicting.json()).toMatchObject({ code: 'SESSION_CONFLICT' });
    expect(conflicting.headers.get('set-cookie')).toBeNull();
  });

  it('rejects cross-origin writes, oversized bodies and unsupported integrations', async () => {
    const cookie = await login();
    const crossOrigin = await handleDemoRequest(
      request('notifications/read-all', cookie, 'POST', undefined, {
        origin: 'https://other.example',
      }),
    );
    expect(crossOrigin.status).toBe(403);
    const oversized = await handleDemoRequest(
      request('payments', cookie, 'POST', { note: 'x'.repeat(13000) }),
    );
    expect(oversized.status).toBe(400);
    const connector = await handleDemoRequest(
      request('messaging/otp-channel/connect', cookie, 'POST'),
    );
    expect(connector.status).toBe(422);
    expect(connector.headers.get('set-cookie')).toBeNull();
  });

  it('accepts an empty streamed command body and rejects a nonempty non-JSON body', async () => {
    const cookie = await login();
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { cookie, origin },
      duplex: 'half',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
    };
    const logout = await handleDemoRequest(new Request(`${origin}/api/v1/auth/logout`, init));
    expect(logout.status).toBe(201);
    expect((await handleDemoRequest(request('auth/me', cookieFrom(logout)))).status).toBe(401);
    const denied = await handleDemoRequest(
      new Request(`${origin}/api/v1/notifications/read-all`, {
        method: 'POST',
        headers: { cookie, origin },
        body: 'not JSON',
      }),
    );
    expect(denied.status).toBe(400);
  });
});
