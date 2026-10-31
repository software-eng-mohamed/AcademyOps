import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { OtpConnectorStatusService } from '../../src/messaging/otp-connector-status.service';
import { get, post } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';

export async function runPlatformRemainingStep(context: HttpTestContext): Promise<void> {
  const initial = await get(context, 'messaging/otp-channel');
  assert.equal(initial.status, 200, await initial.clone().text());
  assert.deepEqual(await initial.json(), {
    id: null,
    provider: 'BAILEYS',
    enabled: false,
    state: 'DISABLED',
    otpAvailable: false,
    needsQr: false,
    phoneMasked: null,
    lastErrorCode: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastHeartbeatAt: null,
    qrExpiresAt: null,
    version: 0,
  });
  const connect = await command(context, 'connect', 0);
  assert.equal(connect.state, 'STARTING');
  assert.equal(connect.version, 1);
  const qr = 'test-whatsapp-pairing-qr-'.repeat(3);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await context.app.get(OtpConnectorStatusService).report({
    organizationId: context.organizationId,
    commandVersion: 1,
    state: 'QR_REQUIRED',
    qr,
    qrExpiresAt: expiresAt,
  });
  const pairing = await get(context, 'messaging/otp-channel/pairing-code');
  assert.equal(pairing.status, 200, await pairing.clone().text());
  assert.deepEqual(await pairing.json(), { qr, expiresAt });
  const reset = await command(context, 'reset', 2);
  assert.equal(reset.state, 'STARTING');
  assert.equal(reset.version, 3);

  const key = `otp-disable-${randomUUID()}`;
  const body = { reason: 'Disable WhatsApp OTP after the connector lifecycle verification' };
  const disabled = await post(context, 'messaging/otp-channel/disable', body, {
    'if-match': '3',
    'idempotency-key': key,
  });
  assert.equal(disabled.status, 200, await disabled.clone().text());
  const disabledBody = (await disabled.json()) as {
    state: string;
    enabled: boolean;
    version: number;
  };
  assert.deepEqual(disabledBody, {
    ...disabledBody,
    state: 'DISABLED',
    enabled: false,
    version: 4,
  });
  const replay = await post(context, 'messaging/otp-channel/disable', body, {
    'if-match': '3',
    'idempotency-key': key,
  });
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), disabledBody);

  const ticket = await post(context, 'realtime/ticket');
  assert.equal(ticket.status, 201, await ticket.clone().text());
  const ticketBody = (await ticket.json()) as { ticket: string; expiresAt: string };
  assert.match(ticketBody.ticket, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Date.parse(ticketBody.expiresAt) > Date.now(), true);
}

async function command(
  context: HttpTestContext,
  command: 'connect' | 'reset',
  version: number,
): Promise<{ state: string; version: number }> {
  const response = await post(
    context,
    `messaging/otp-channel/${command}`,
    { reason: `HTTP ${command} connector lifecycle verification` },
    { 'if-match': String(version), 'idempotency-key': `otp-${command}-${randomUUID()}` },
  );
  assert.equal(response.status, 200, await response.clone().text());
  return response.json() as Promise<{ state: string; version: number }>;
}
