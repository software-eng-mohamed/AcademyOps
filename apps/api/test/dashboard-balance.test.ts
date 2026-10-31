import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DashboardBalanceService } from '../src/reporting/dashboard-balance.service';

describe('DashboardBalanceService', () => {
  it('returns zero without querying when branch scope is empty', async () => {
    const queryRaw = vi.fn();
    const service = new DashboardBalanceService({ $queryRaw: queryRaw } as never);

    const result = await service.financialHealth('org-1', [], '2026-09-05');

    expect(result.outstandingBalance.toFixed(2)).toBe('0.00');
    expect(result.overdueBalance.toFixed(2)).toBe('0.00');
    expect(result.overdueEnrollmentCount).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('uses a tenant and branch scoped aggregate result', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([{ outstandingBalance: new Prisma.Decimal('42.50') }]);
    const service = new DashboardBalanceService({ $queryRaw: queryRaw } as never);

    const result = await service.financialHealth(
      '00000000-0000-4000-8000-000000000001',
      ['00000000-0000-4000-8000-000000000002'],
      '2026-09-05',
    );

    expect(result.outstandingBalance.toFixed(2)).toBe('42.50');
    const query = queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.values.slice(0, 3)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      ['00000000-0000-4000-8000-000000000002'],
    ]);
    expect(query.values.slice(3)).toEqual([
      '2026-09-05',
      '2026-09-05',
      '2026-09-05',
      '2026-10-05',
      '2026-09-05',
      '2026-09-05',
      '2026-09-05',
      '2026-09-05',
      '2026-09-05',
      '2026-09-05',
      '2026-09-05',
      '2026-09-05',
    ]);
  });
});
