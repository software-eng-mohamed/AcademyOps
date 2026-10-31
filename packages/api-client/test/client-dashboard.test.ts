import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from '../src/client.js';
import { PlgApiError } from '../src/errors.js';

afterEach(() => vi.unstubAllGlobals());
describe('PlgApiClient dashboard & report endpoints with runtime validation', () => {
  const client = new PlgApiClient({ baseUrl: 'http://localhost:3001/api/v1' });
  it('validates and returns financeReceivables data', async () => {
    const validData = {
      asOf: '2026-08-10',
      branchId: 'b-1',
      currencyCode: 'EGP',
      enrollmentCount: 5,
      outstandingEnrollmentCount: 2,
      totals: { debits: '1000.00', allocated: '400.00', outstanding: '600.00' },
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(validData), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = await client.financeReceivables('b-1', '2026-08-10');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/reports/finance/receivables?branchId=b-1&asOf=2026-08-10',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(res.totals.outstanding).toBe('600.00');
  });
  it('rejects malformed financeReceivables response', async () => {
    const malformed = { asOf: '2026-08-10', totals: 'not-an-object' };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(malformed), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.financeReceivables('b-1')).rejects.toThrow(PlgApiError);
  });
  it('validates and returns financeAging report', async () => {
    const validData = {
      asOf: '2026-08-10',
      currencyCode: 'EGP',
      totals: { CURRENT: '500.00' },
      rows: [
        {
          installmentId: 'inst-1',
          enrollmentId: 'e-1',
          dueDate: '2026-08-01',
          ageDays: 9,
          bucket: 'CURRENT',
          outstanding: '500.00',
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(validData), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = await client.financeAging('b-1');
    expect(res.rows[0]?.installmentId).toBe('inst-1');
  });
  it('rejects malformed financeAging row', async () => {
    const malformed = {
      asOf: '2026-08-10',
      currencyCode: 'EGP',
      totals: {},
      rows: [{ installmentId: 123 }],
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(malformed), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.financeAging('b-1')).rejects.toThrow(PlgApiError);
  });
  it('validates academic calendar output', async () => {
    const validData = {
      from: '2026-08-10T00:00:00Z',
      to: '2026-08-17T00:00:00Z',
      items: [
        {
          id: 'sess-1',
          cohortId: 'c-1',
          roomId: 'r-1',
          startsAt: '2026-08-10T10:00:00Z',
          endsAt: '2026-08-10T12:00:00Z',
          deliveryMode: 'IN_PERSON',
          status: 'SCHEDULED',
          attendanceWindowState: 'OPEN',
          cohort: { id: 'c-1', code: 'C1', name: 'Cohort 1' },
          room: { id: 'r-1', code: 'R-1', name: 'Room 1' },
          trainers: [
            { id: 'st-1', sessionId: 'sess-1', trainerId: 'tr-1', bookingStatus: 'CONFIRMED' },
          ],
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(validData), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = await client.calendar({ from: '2026-08-10T00:00:00Z', to: '2026-08-17T00:00:00Z' });
    expect(res.items[0]?.trainers[0]?.trainerId).toBe('tr-1');
  });
  it('rejects malformed academic calendar item', async () => {
    const malformed = {
      from: '2026-08-10T00:00:00Z',
      to: '2026-08-17T00:00:00Z',
      items: [{ id: 'sess-1' }],
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(malformed), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      client.calendar({ from: '2026-08-10T00:00:00Z', to: '2026-08-17T00:00:00Z' }),
    ).rejects.toThrow(PlgApiError);
  });
  it('fetches and validates student enrollments, attendance, finance, and certificates', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/enrollments/enr-1/attendance-summary')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              enrollmentId: 'enr-1',
              numerator: 8,
              denominator: 10,
              ratio: '0.8000',
              minimumRatio: '0.8000',
              meetsPolicy: true,
              statusCounts: { PRESENT: 8, ABSENT: 2 },
              makeupCredits: 0,
              policyId: 'p-1',
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/enrollments/enr-1/finance-summary')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              billingAccountId: 'ba-1',
              enrollmentId: 'enr-1',
              currencyCode: 'EGP',
              totalDebits: '1000.00',
              totalCredits: '500.00',
              balance: '500.00',
              outstandingDebits: '500.00',
              unappliedCredits: '0.00',
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    await client.listEnrollments({ limit: 20 });
    const att = await client.getAttendanceSummary('enr-1');
    const fin = await client.getFinanceSummary('enr-1');
    await client.listCertificates({ limit: 20 });
    expect(att.statusCounts.PRESENT).toBe(8);
    expect(fin.outstandingDebits).toBe('500.00');
  });
});
