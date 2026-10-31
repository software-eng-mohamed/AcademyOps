import { io, type Socket } from 'socket.io-client';
import { test, expect } from '../support/test';
import { assertTargetAllowed, E2E_BASE_URL } from '../support/environment';

interface Resync {
  v: number;
  topics: string[];
  occurredAt: string;
}

function connectForResync(socket: Socket): Promise<Resync> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error('Authenticated realtime resync timed out.')),
      10_000,
    );
    const finish = (error?: Error, payload?: Resync) => {
      clearTimeout(timeout);
      socket.off('realtime:resync', onResync);
      socket.off('connect_error', onError);
      socket.off('disconnect', onDisconnect);
      if (error) reject(error);
      else resolve(payload!);
    };
    const onResync = (payload: Resync) => finish(undefined, payload);
    const onError = () => finish(new Error('Realtime transport could not authenticate.'));
    const onDisconnect = () => finish(new Error('Realtime session disconnected before resync.'));
    socket.once('realtime:resync', onResync);
    socket.once('connect_error', onError);
    socket.once('disconnect', onDisconnect);
    socket.connect();
  });
}

test('a browser session reconnects with fresh realtime tickets and rejects ticket replay', async ({
  page,
  context,
}) => {
  const target =
    process.env.E2E_REALTIME_URL || process.env.NEXT_PUBLIC_REALTIME_URL || process.env.API_ORIGIN;
  if (!target) throw new Error('Set E2E_REALTIME_URL to the local live API socket origin.');
  const realtimeOrigin = assertTargetAllowed(target, process.env).origin;
  await page.goto('/en/dashboard');
  await expect(page.locator('[data-overview-role="STUDENT"]')).toBeVisible();
  const cookies = await context.cookies(E2E_BASE_URL);
  const session = cookies.find((cookie) =>
    ['plg_session', '__Host-plg_session'].includes(cookie.name),
  );
  const csrf = cookies.find((cookie) => ['plg_csrf', '__Host-plg_csrf'].includes(cookie.name));
  if (!session || !csrf)
    throw new Error('The authenticated browser session must provide session and CSRF cookies.');
  const ticket = async () => {
    const response = await page.request.post('/api/v1/realtime/ticket', {
      headers: { origin: E2E_BASE_URL, 'x-csrf-token': csrf.value },
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { ticket: string };
    expect(typeof body.ticket).toBe('string');
    return body.ticket;
  };
  const createSocket = (value: string) =>
    io(realtimeOrigin, {
      path: '/socket.io',
      addTrailingSlash: false,
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
      auth: { ticket: value },
      extraHeaders: { Origin: E2E_BASE_URL, Cookie: `${session.name}=${session.value}` },
    });
  const usedTicket = await ticket();
  for (const value of [usedTicket, await ticket()]) {
    const socket = createSocket(value);
    try {
      const payload = await connectForResync(socket);
      expect(payload.v).toBe(1);
      expect(payload.topics).toEqual(expect.arrayContaining(['student', 'attendance', 'calendar']));
      expect(payload.topics).not.toContain('owner');
      expect(payload.topics).not.toContain('messaging');
      expect(Number.isNaN(Date.parse(payload.occurredAt))).toBe(false);
    } finally {
      socket.disconnect();
    }
  }
  const replay = createSocket(usedTicket);
  let resynced = false;
  replay.on('realtime:resync', () => {
    resynced = true;
  });
  try {
    const reason = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('A replayed ticket was not rejected.')),
        10_000,
      );
      replay.once('disconnect', (reason) => {
        clearTimeout(timeout);
        resolve(reason);
      });
      replay.once('connect_error', () => {
        clearTimeout(timeout);
        reject(new Error('Realtime transport failed during the ticket replay check.'));
      });
      replay.connect();
    });
    expect(reason).toBe('io server disconnect');
    expect(resynced).toBe(false);
    expect(replay.connected).toBe(false);
  } finally {
    replay.disconnect();
  }
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
});
