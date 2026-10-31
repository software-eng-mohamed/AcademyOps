import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { assertOwnerContinuity } from '../src/iam/administration/last-owner-policy';

describe('last active Owner policy', () => {
  it('serializes the check and blocks removal of the final active Owner', async () => {
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ activeOwners: 1, targetIsActiveOwner: true }]),
    };

    await expect(
      assertOwnerContinuity(
        transaction as never,
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
  });

  it('allows changes when another active Owner remains', async () => {
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ activeOwners: 2, targetIsActiveOwner: true }]),
    };
    await expect(
      assertOwnerContinuity(
        transaction as never,
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toBeUndefined();
  });
});
