import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OtpChannelAvailabilityService } from '../src/messaging/otp-channel-availability.service';

describe('OtpChannelAvailabilityService', () => {
  it('allows OTP only for a connected channel with a fresh connector heartbeat', async () => {
    const prisma = { whatsappOtpChannel: { findUnique: vi.fn() } };
    const service = new OtpChannelAvailabilityService(prisma as never);
    prisma.whatsappOtpChannel.findUnique.mockResolvedValue(channel(new Date()));
    const status = await service.read('org-a');
    expect(status).toEqual(
      expect.objectContaining({
        enabled: true,
        state: 'CONNECTED',
        lastErrorCode: null,
      }),
    );
    expect(status.otpAvailable).toBe(true);
    expect(status.needsQr).toBe(false);
    expect(status.lastHeartbeatAt).not.toBeNull();
    await expect(service.assertAvailable('org-a')).resolves.toBeUndefined();
  });

  it('fails closed when the connector heartbeat is stale', async () => {
    const prisma = { whatsappOtpChannel: { findUnique: vi.fn() } };
    const service = new OtpChannelAvailabilityService(prisma as never);
    prisma.whatsappOtpChannel.findUnique.mockResolvedValue(channel(new Date(Date.now() - 76_000)));
    const status = await service.read('org-a');
    expect(status.state).toBe('STALE');
    expect(status.otpAvailable).toBe(false);
    await expect(service.assertAvailable('org-a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns a disabled version-zero snapshot before channel provisioning', async () => {
    const prisma = {
      whatsappOtpChannel: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const service = new OtpChannelAvailabilityService(prisma as never);
    expect(await service.read('org-a')).toEqual(
      expect.objectContaining({
        id: null,
        state: 'DISABLED',
        version: 0,
        otpAvailable: false,
        lastErrorCode: null,
      }),
    );
  });
});

function channel(lastHeartbeatAt: Date) {
  return {
    id: 'channel-a',
    organizationId: 'org-a',
    provider: 'BAILEYS',
    enabled: true,
    desiredState: 'CONNECTED',
    state: 'CONNECTED',
    phoneMasked: '+20•••••7890',
    lastErrorCode: null,
    lastConnectedAt: new Date(),
    lastDisconnectedAt: null,
    lastHeartbeatAt,
    qrExpiresAt: null,
    commandVersion: 1,
    handledCommandVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
