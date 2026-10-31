import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ImportFinanceWriter } from '../src/imports/import-finance-writer';

describe('import finance writer idempotency guard', () => {
  it('fails closed when a matching idempotency key belongs to another enrollment', async () => {
    const referenceCreate = vi.fn();
    const db = {
      pricingAgreement: {
        findFirst: vi.fn().mockResolvedValue({ id: 'agreement' }),
      },
      ledgerEntry: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { direction?: string } }) =>
          Promise.resolve(
            where.direction === 'DEBIT'
              ? { id: 'debit', enrollmentId: 'enrollment-a' }
              : {
                  id: 'credit',
                  enrollmentId: 'enrollment-b',
                  billingAccountId: 'billing-b',
                  direction: 'CREDIT',
                  entryType: 'PAYMENT',
                  sourceType: 'LEGACY_IMPORT_PAYMENT',
                  sourceId: 'payment',
                  amount: 60,
                },
          ),
        ),
      },
      paymentMethod: { upsert: vi.fn().mockResolvedValue({ id: 'method' }) },
      payment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'payment',
          enrollmentId: 'enrollment-b',
          billingAccountId: 'billing-b',
          ledgerEntryId: 'credit',
          methodId: 'method',
          status: 'POSTED',
          amount: 60,
          receivedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      },
      ledgerAllocation: {
        findMany: vi.fn().mockResolvedValue([{ amount: 60 }]),
      },
      legacyReference: { findFirst: vi.fn(), create: referenceCreate },
    } as never;
    const writer = new ImportFinanceWriter();

    await expect(
      writer.write(
        db,
        { organizationId: 'org', actorUserId: 'actor' } as never,
        { id: 'row', rowHash: 'a'.repeat(64) },
        'enrollment-a',
        'billing-a',
        {
          legacyCode: 'L-1',
          cohortCode: 'P 1',
          subtotal: 100,
          discountAmount: 0,
          totalAmount: 100,
          paidAmount: 60,
          payments: [
            {
              amount: 60,
              method: 'Cash',
              receivedAt: '2026-01-02T00:00:00.000Z',
              sourceOrdinal: 1,
            },
          ],
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(referenceCreate).not.toHaveBeenCalled();
  });

  it('rejects reuse when the payment credit is also allocated to another debit', async () => {
    const referenceCreate = vi.fn();
    const db = {
      pricingAgreement: {
        findFirst: vi.fn().mockResolvedValue({ id: 'agreement' }),
      },
      ledgerEntry: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { direction?: string } }) =>
          Promise.resolve(
            where.direction === 'DEBIT'
              ? { id: 'debit', enrollmentId: 'enrollment-a' }
              : {
                  id: 'credit',
                  enrollmentId: 'enrollment-a',
                  billingAccountId: 'billing-a',
                  direction: 'CREDIT',
                  entryType: 'PAYMENT',
                  sourceType: 'LEGACY_IMPORT_PAYMENT',
                  sourceId: 'payment',
                  amount: 60,
                },
          ),
        ),
      },
      paymentMethod: { upsert: vi.fn().mockResolvedValue({ id: 'method' }) },
      payment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'payment',
          enrollmentId: 'enrollment-a',
          billingAccountId: 'billing-a',
          ledgerEntryId: 'credit',
          methodId: 'method',
          status: 'POSTED',
          amount: 60,
          receivedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      },
      ledgerAllocation: {
        findMany: vi.fn().mockResolvedValue([
          { debitEntryId: 'debit', amount: 59 },
          { debitEntryId: 'unrelated-debit', amount: 1 },
        ]),
      },
      legacyReference: { findFirst: vi.fn(), create: referenceCreate },
    } as never;
    const writer = new ImportFinanceWriter();

    await expect(
      writer.write(
        db,
        { organizationId: 'org', actorUserId: 'actor' } as never,
        { id: 'row', rowHash: 'a'.repeat(64) },
        'enrollment-a',
        'billing-a',
        {
          legacyCode: 'L-1',
          cohortCode: 'P 1',
          subtotal: 100,
          discountAmount: 0,
          totalAmount: 100,
          paidAmount: 60,
          payments: [
            {
              amount: 60,
              method: 'Cash',
              receivedAt: '2026-01-02T00:00:00.000Z',
              sourceOrdinal: 1,
            },
          ],
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(referenceCreate).not.toHaveBeenCalled();
  });
});
