import { describe, expect, it, vi } from 'vitest';
import { OtpChannelWatchdogService } from '../src/worker/otp-channel-watchdog.service';

describe('OtpChannelWatchdogService', () => {
  it('terminalizes stale connected channels and emits one sanitized alert', async () => {
    const fixture = setup(1);
    const now = new Date('2026-08-20T12:00:00.000Z');
    await fixture.service.inspect(now);
    expect(fixture.prisma.whatsappOtpChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    const update = fixture.tx.whatsappOtpChannel.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.state).toBe('STALE');
    expect(update.data.lastErrorCode).toBe('OTP_CONNECTOR_HEARTBEAT_STALE');
    const event = fixture.outbox.add.mock.calls[0]?.[1] as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(event.type).toBe('messaging.otp_channel.unavailable');
    expect(event.payload).not.toHaveProperty('phone');
  });

  it('does not emit when another worker already changed the row', async () => {
    const fixture = setup(0);
    await fixture.service.inspect();
    expect(fixture.outbox.add).not.toHaveBeenCalled();
  });
});

function setup(changed: number) {
  const candidate = { id: 'channel-a', organizationId: 'org-a' };
  const tx = {
    whatsappOtpChannel: { updateMany: vi.fn().mockResolvedValue({ count: changed }) },
  };
  const prisma = {
    whatsappOtpChannel: { findMany: vi.fn().mockResolvedValue([candidate]) },
    serializable: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const outbox = { add: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new OtpChannelWatchdogService(prisma as never, outbox as never),
    prisma,
    tx,
    outbox,
  };
}
