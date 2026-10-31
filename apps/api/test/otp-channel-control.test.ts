import { ConflictException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import { OtpChannelControlService } from '../src/messaging/otp-channel-control.service';

describe('OtpChannelControlService', () => {
  it('creates an audited connect command for a connector to consume', async () => {
    const fixture = setup(null);
    await fixture.service.command(
      access(),
      'CONNECT',
      'Initial secure pairing',
      0,
      'idem-connect-1',
      'corr-a',
    );
    const createInput = fixture.tx.whatsappOtpChannel.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createInput.data.organizationId).toBe('org-a');
    expect(createInput.data.enabled).toBe(true);
    expect(createInput.data.desiredState).toBe('CONNECTED');
    expect(createInput.data.state).toBe('STARTING');
    expect(createInput.data.commandVersion).toBe(1);
    expect(fixture.audit.write).toHaveBeenCalledOnce();
    expect(fixture.outbox.add).toHaveBeenCalledOnce();
  });

  it('keeps the audited disable command available', async () => {
    const fixture = setup(existing());
    const result = await fixture.service.command(
      access(),
      'DISABLE',
      'Operator disabled channel',
      4,
      'idem-disable-1',
      'corr-b',
    );

    expect(result).toEqual(status());
    const updateInput = fixture.tx.whatsappOtpChannel.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateInput.data).toEqual(
      expect.objectContaining({
        enabled: false,
        desiredState: 'DISCONNECTED',
        state: 'DISABLED',
      }),
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.tx,
      expect.objectContaining({ metadata: { reason: 'Operator disabled channel' } }),
    );
    const outboxInput = fixture.outbox.add.mock.calls[0]?.[1] as { payload: unknown };
    expect(JSON.stringify(outboxInput.payload)).not.toContain('Operator disabled channel');
  });

  it('rejects stale versions before mutating channel state', async () => {
    const fixture = setup(existing());
    await expect(
      fixture.service.command(
        access(),
        'DISABLE',
        'Operator disabled channel',
        3,
        'idem-disable-2',
        'corr-c',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.tx.whatsappOtpChannel.update).not.toHaveBeenCalled();
  });

  it('does not clear a newer pairing QR when an earlier connect command is replayed', async () => {
    const fixture = setup(existing(), { replayed: true, recordId: 'record-a', response: status() });
    await fixture.service.command(
      access(),
      'CONNECT',
      'Original connection command',
      0,
      'connect-replay',
      'corr-replay',
    );
    expect(fixture.qr.clear).not.toHaveBeenCalled();
  });

  it('replays an idempotent command without a second mutation', async () => {
    const fixture = setup(existing(), {
      replayed: true,
      recordId: 'record-a',
      response: status(),
    });
    expect(
      await fixture.service.command(
        access(),
        'DISABLE',
        'Repeat the disable command',
        4,
        'idem-disable-3',
        'corr-d',
      ),
    ).toEqual(status());
    expect(fixture.tx.whatsappOtpChannel.update).not.toHaveBeenCalled();
  });
});

function setup(current: ReturnType<typeof existing> | null, attempt?: object) {
  const created = existing();
  created.version = 1;
  const tx = {
    whatsappOtpChannel: {
      findUnique: vi.fn().mockResolvedValue(current),
      create: vi.fn().mockResolvedValue(created),
      update: vi.fn().mockResolvedValue(created),
    },
  };
  const prisma = { serializable: vi.fn((work: (client: typeof tx) => unknown) => work(tx)) };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const outbox = { add: vi.fn().mockResolvedValue(undefined) };
  const idempotency = {
    begin: vi.fn().mockResolvedValue(attempt ?? { replayed: false, recordId: 'record-a' }),
    complete: vi.fn().mockResolvedValue(undefined),
  };
  const availability = { snapshot: vi.fn().mockReturnValue(status()) };
  const qr = { clear: vi.fn().mockResolvedValue(1) };
  const service = new OtpChannelControlService(
    prisma as never,
    audit as never,
    outbox as never,
    idempotency as never,
    availability as never,
    qr as never,
  );
  return { service, prisma, tx, audit, outbox, qr };
}

function access(): AccessContext {
  return {
    organizationId: 'org-a',
    actorUserId: 'user-a',
    grants: new Map([['messaging.otp.manage', new Set(['O'])]]),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };
}

function existing() {
  return {
    id: 'channel-a',
    organizationId: 'org-a',
    provider: 'BAILEYS',
    enabled: true,
    desiredState: 'CONNECTED',
    state: 'CONNECTED',
    commandVersion: 4,
    handledCommandVersion: 4,
    version: 4,
  };
}

function status() {
  return {
    id: 'channel-a',
    provider: 'BAILEYS' as const,
    enabled: false,
    state: 'DISABLED' as const,
    otpAvailable: false,
    needsQr: false,
    phoneMasked: null,
    lastErrorCode: 'OTP_CONNECTOR_NOT_CONFIGURED',
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastHeartbeatAt: null,
    qrExpiresAt: null,
    version: 1,
  };
}
