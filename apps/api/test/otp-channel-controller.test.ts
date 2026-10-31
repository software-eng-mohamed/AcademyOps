import { ConflictException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import { OtpChannelController } from '../src/messaging/otp-channel.controller';

describe('OtpChannelController pairing QR', () => {
  it('never returns an orphaned QR after the channel is disabled', async () => {
    const qr = { read: vi.fn().mockResolvedValue({ qr: 'x'.repeat(30), expiresAt: expiry() }) };
    const availability = { read: vi.fn().mockResolvedValue(status(false)) };
    const controller = new OtpChannelController(availability as never, {} as never, qr as never);

    await expect(controller.pairingCode(access())).rejects.toBeInstanceOf(ConflictException);
    expect(qr.read).not.toHaveBeenCalled();
  });

  it('returns only the QR that matches the current database expiry', async () => {
    const value = { qr: 'x'.repeat(30), expiresAt: expiry() };
    const qr = { read: vi.fn().mockResolvedValue(value) };
    const availability = { read: vi.fn().mockResolvedValue(status(true)) };
    const controller = new OtpChannelController(availability as never, {} as never, qr as never);

    await expect(controller.pairingCode(access())).resolves.toEqual(value);
  });
});

function expiry(): string {
  return '2026-08-15T03:00:00.000Z';
}

function status(needsQr: boolean) {
  return { needsQr, qrExpiresAt: needsQr ? expiry() : null };
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
