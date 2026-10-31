import { describe, expect, it } from 'vitest';
import { resolveDashboardPeriod } from '../src/common/time/dashboard-period';

describe('dashboard period', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('defaults to the last six inclusive Cairo months', () => {
    const period = resolveDashboardPeriod({}, now);
    expect(period.fromMonth).toBe('2026-03');
    expect(period.toMonth).toBe('2026-08');
    expect(period.timeZone).toBe('Africa/Cairo');
  });

  it('keeps Cairo midnight boundaries across daylight-saving offsets', () => {
    const period = resolveDashboardPeriod({ fromMonth: '2026-03', toMonth: '2026-05' }, now);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      timeZone: 'Africa/Cairo',
      year: 'numeric',
    });
    const parts = (date: Date) =>
      Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    expect(parts(period.from)).toMatchObject({
      day: '01',
      hour: '00',
      minute: '00',
      month: '03',
      year: '2026',
    });
    expect(parts(period.toExclusive)).toMatchObject({
      day: '01',
      hour: '00',
      minute: '00',
      month: '06',
      year: '2026',
    });
  });

  it.each([
    { fromMonth: '2026-01' },
    { toMonth: '2026-08' },
    { fromMonth: '2025-08', toMonth: '2026-08' },
    { fromMonth: '2026-09', toMonth: '2026-09' },
    { fromMonth: '2026-08', toMonth: '2026-03' },
  ])('rejects an invalid dashboard range: %o', (input) => {
    expect(() => resolveDashboardPeriod(input, now)).toThrow();
  });
});
