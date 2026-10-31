import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OtpConnectorStatusService } from '../src/messaging/otp-connector-status.service';

describe('OtpConnectorStatusService', () => {
  it('stores a current QR and publishes a QR-required transition', async () => {
    const fixture = setup(channel({ state: 'STARTING' }));
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await fixture.service.report({
      organizationId: 'org-a',
      commandVersion: 3,
      state: 'QR_REQUIRED',
      qr: 'q'.repeat(64),
      qrExpiresAt: expiresAt,
    });
    expect(fixture.qr.write).toHaveBeenCalledWith('org-a', 'q'.repeat(64), new Date(expiresAt));
    expect(fixture.outbox.add).toHaveBeenCalledWith(
      fixture.tx,
      expect.objectContaining({ type: 'messaging.otp_channel.qr_required' }),
    );
  });

  it('updates a heartbeat without incrementing the operator-facing version', async () => {
    const fixture = setup(channel({ state: 'CONNECTED', handledCommandVersion: 3 }));
    await fixture.service.report({
      organizationId: 'org-a',
      commandVersion: 3,
      state: 'CONNECTED',
      phoneMasked: '***4567',
    });
    const data = fixture.tx.whatsappOtpChannel.update.mock.calls[0]?.[0].data;
    expect(data.lastHeartbeatAt).toBeInstanceOf(Date);
    expect(data.version).toBeUndefined();
    expect(fixture.outbox.add).not.toHaveBeenCalled();
  });

  it('rejects reports for a stale command version', async () => {
    const fixture = setup(channel());
    await expect(
      fixture.service.report({ organizationId: 'org-a', commandVersion: 2, state: 'CONNECTED' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.tx.whatsappOtpChannel.update).not.toHaveBeenCalled();
  });

  it('rejects a stale QR report before overwriting the current pairing credential', async () => {
    const fixture = setup(channel());
    await expect(
      fixture.service.report({
        organizationId: 'org-a',
        commandVersion: 2,
        state: 'QR_REQUIRED',
        qr: 'old-pairing-credential'.repeat(3),
        qrExpiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.qr.write).not.toHaveBeenCalled();
    expect(fixture.qr.clear).not.toHaveBeenCalled();
  });
});

function setup(current: ReturnType<typeof channel>) {
  const tx = {
    whatsappOtpChannel: {
      findUnique: vi.fn().mockResolvedValue(current),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const state = typeof data.state === 'string' ? data.state : current.state;
        return Promise.resolve({ ...current, ...data, state });
      }),
    },
  };
  const prisma = { serializable: vi.fn((work: (client: typeof tx) => unknown) => work(tx)) };
  const outbox = { add: vi.fn().mockResolvedValue(undefined) };
  const qr = { write: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(1) };
  return {
    service: new OtpConnectorStatusService(prisma as never, outbox as never, qr as never),
    tx,
    outbox,
    qr,
  };
}

function channel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'channel-a',
    organizationId: 'org-a',
    provider: 'BAILEYS',
    enabled: true,
    desiredState: 'CONNECTED',
    state: 'STARTING',
    phoneMasked: '***4567',
    lastErrorCode: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastHeartbeatAt: null,
    qrExpiresAt: null,
    commandVersion: 3,
    handledCommandVersion: 2,
    version: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
