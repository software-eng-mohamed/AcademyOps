import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { SecurityOutboxRetentionService } from '../src/worker/security/security-outbox-retention.service';

describe('security outbox retention', () => {
  it('redacts processed reset and OTP payloads after their validity window', async () => {
    const execute = vi.fn().mockResolvedValue(2);
    const service = new SecurityOutboxRetentionService({ $executeRaw: execute } as PrismaService);

    await service.run();

    expect(execute).toHaveBeenCalledOnce();
    const query = (execute.mock.calls[0]?.[0] as TemplateStringsArray).join(' ');
    expect(query).toContain('security.password_reset_requested');
    expect(query).toContain('security.phone_otp_requested');
    expect(query).toContain('processed_at');
    expect(query).toContain('redacted');
  });
});
