import { describe, expect, it } from 'vitest';
import { getExecutiveMetricDetail } from '@/features/dashboard/overview/executive-comparison-data';
import { buildMonthlyComparison } from '@/features/dashboard/overview/executive-trend-data';
import { mockOverview } from './fixtures/owner-overview';

describe('recorded executive metrics', () => {
  it('preserves zero balances and counts instead of substituting demo figures', () => {
    const overview = structuredClone(mockOverview);
    overview.kpis.netCollectionsThisMonth = '0';
    overview.kpis.activeStudents = 0;
    overview.financeHealth.overdueBalance = '0';
    overview.salesPipeline.convertedLeadsThisMonth = 0;
    overview.salesPipeline.openLeads = 0;
    for (const key of ['netCollections', 'overdueReceivables'] as const) {
      expect(getExecutiveMetricDetail(key, overview, 'en').currentValue).toBe('E£0');
    }
    for (const key of ['activeStudents', 'convertedLeads', 'salesPipeline'] as const) {
      expect(getExecutiveMetricDetail(key, overview, 'en').currentValue).toBe('0');
    }
  });

  it('does not substitute active students for new enrollments or invent a missing series', () => {
    const overview = structuredClone(mockOverview);
    overview.trends.enrollments = [];
    overview.trends.collections = [];
    expect(getExecutiveMetricDetail('enrollmentsTrend', overview, 'en')).toMatchObject({
      currentValue: '—',
      monthly: [],
    });
    expect(getExecutiveMetricDetail('netCollections', overview, 'en').monthly).toEqual([]);
    expect(getExecutiveMetricDetail('activeStudents', mockOverview, 'en')).toMatchObject({
      currentValue: '540',
      monthly: [],
    });
    expect(getExecutiveMetricDetail('enrollmentsTrend', mockOverview, 'en').currentValue).toBe(
      '62',
    );
  });

  it('uses actual aging buckets and separate attendance and action metrics', () => {
    expect(
      getExecutiveMetricDetail('receivablesAging', mockOverview, 'en').breakdown.map(
        (row) => row.rawValue,
      ),
    ).toEqual([120000, 35000, 15000, 8000, 4000]);
    expect(getExecutiveMetricDetail('attendanceHealth', mockOverview, 'en').currentValue).toBe(
      '92.5%',
    );
    expect(getExecutiveMetricDetail('ownerActions', mockOverview, 'en').currentValue).toBe('0');
    expect(getExecutiveMetricDetail('ownerActions', mockOverview, 'en').actionHref).toBe(
      '/en/reports',
    );
  });

  it('sorts recorded months and computes changes only between consecutive nonzero baselines', () => {
    const rows = buildMonthlyComparison(
      [
        { period: '2026-04', value: 30 },
        { period: '2026-01', value: 0 },
        { period: '2026-05', value: 0 },
        { period: '2026-02', value: 20 },
      ],
      'en',
      String,
    );
    expect(rows.map((row) => [row.periodKey, row.rawValue, row.deltaPercent])).toEqual([
      ['2026-05', 0, -100],
      ['2026-04', 30, undefined],
      ['2026-02', 20, undefined],
      ['2026-01', 0, undefined],
    ]);
  });

  it('omits invalid observations instead of rendering NaN or claiming missing values are zero', () => {
    const rows = buildMonthlyComparison(
      [
        { period: '2026-01', value: 10 },
        { period: '2026-02', value: Number.NaN },
        { period: '2026-13', value: 40 },
        { period: '2026-03', value: 20 },
      ],
      'en',
      String,
    );
    expect(rows.map((row) => row.periodKey)).toEqual(['2026-03', '2026-01']);
    expect(rows[0]?.deltaPercent).toBeUndefined();
    const overview = structuredClone(mockOverview);
    overview.financeHealth.overdueBalance = '';
    expect(getExecutiveMetricDetail('overdueReceivables', overview, 'en').currentValue).toBe('—');
  });
});
