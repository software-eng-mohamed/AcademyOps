import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  StaffBarChart,
  StaffDonutChart,
  StaffLineChart,
} from '@/features/dashboard/overview/staff-overview-charts';

const seen = vi.hoisted(() => ({ bar: vi.fn(), line: vi.fn(), pie: vi.fn() }));
vi.mock('@nivo/bar', () => ({
  ResponsiveBar: (props: unknown) => {
    seen.bar(props);
    return null;
  },
}));
vi.mock('@nivo/line', () => ({
  ResponsiveLine: (props: unknown) => {
    seen.line(props);
    return null;
  },
}));
vi.mock('@nivo/pie', () => ({
  ResponsivePie: (props: unknown) => {
    seen.pie(props);
    return null;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const props = {
  title: 'Collections',
  locale: 'en' as const,
  data: [{ label: 'Sep', amount: 40.55 }],
  series: [{ id: 'amount', label: 'Amount', color: '#14b8a6' }],
};
it.each(['en', 'ar'] as const)(
  'orders bar dates and the value axis for %s without mutating source data',
  (locale) => {
    const data = [
      { label: 'First', amount: 1 },
      { label: 'Last', amount: 3 },
    ];
    render(<StaffBarChart {...props} data={data} locale={locale} />);
    const p = seen.bar.mock.lastCall?.[0];
    expect(p.data.map((d: { label: string }) => d.label)).toEqual(
      locale === 'ar' ? ['Last', 'First'] : ['First', 'Last'],
    );
    expect(data.map((d) => d.label)).toEqual(['First', 'Last']);
    expect(locale === 'ar' ? p.axisLeft : p.axisRight).toBeNull();
    expect(locale === 'ar' ? p.axisRight : p.axisLeft).toMatchObject({ tickValues: [0, 1, 2, 3] });
    expect(p.valueScale.min).toBe(0);
  },
);
it.each(['en', 'ar'] as const)(
  'orders line observations for %s with the same values and matching ticks',
  (locale) => {
    const data = [
      { label: 'First', amount: 1 },
      { label: 'Last', amount: 3 },
    ];
    render(<StaffLineChart {...props} data={data} locale={locale} />);
    const p = seen.line.mock.lastCall?.[0];
    expect(p.data[0].data).toEqual(
      locale === 'ar'
        ? [
            { x: 'Last', y: 3 },
            { x: 'First', y: 1 },
          ]
        : [
            { x: 'First', y: 1 },
            { x: 'Last', y: 3 },
          ],
    );
    expect(p.axisBottom.tickValues).toEqual(
      locale === 'ar' ? ['Last', 'First'] : ['First', 'Last'],
    );
    expect(locale === 'ar' ? p.axisLeft : p.axisRight).toBeNull();
    expect(data[0]?.label).toBe('First');
  },
);
it.each(['en', 'ar'] as const)(
  'mirrors donut order in %s without changing slice values or colors',
  (locale) => {
    const data = [
      { id: 'Present', value: 3, color: '#14b8a6' },
      { id: 'Late', value: 1, color: '#f59e0b' },
    ];
    render(<StaffDonutChart title="Attendance" locale={locale} data={data} />);
    expect(seen.pie.mock.lastCall?.[0].data).toEqual(locale === 'ar' ? data.toReversed() : data);
    expect(data[0]?.id).toBe('Present');
  },
);
it('renders zero-based, motion-free bars with precise currency labels', () => {
  render(<StaffBarChart {...props} unit="money" />);
  const p = seen.bar.mock.calls[0]?.[0];
  expect(p.data).toEqual(props.data);
  expect(p.valueScale.min).toBe(0);
  expect(p.animate).toBe(false);
  expect(p.valueFormat(40.55)).toContain('40.55');
  expect(p.ariaLabel).toBe('Collections');
  expect(p.borderRadius).toBe(4);
  expect(p).not.toHaveProperty('gridYValues');
  expect(p).not.toHaveProperty('onResize');
});
it('rounds collection bars and adapts labels without changing any values', () => {
  const data = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map((label, index) => ({
    label,
    amount: index === 5 ? 0 : 40.55,
  }));
  render(<StaffBarChart {...props} data={data} unit="money" barStyle="rounded" />);
  let p = seen.bar.mock.lastCall?.[0];
  expect(p.data).toEqual(data);
  expect(p.borderRadius).toBe(10);
  expect(p.valueScale.min).toBe(0);
  expect(p.valueScale.max).toBeGreaterThan(40.55);
  expect(p.gridYValues).toEqual(p.axisLeft.tickValues);
  expect(p.axisBottom.tickValues).toEqual(['Apr', 'Jul', 'Sep']);
  act(() => p.onResize({ width: 800, height: 300 }));
  p = seen.bar.mock.lastCall?.[0];
  expect(p.axisBottom.tickValues).toEqual(data.map((row) => row.label));
  act(() => p.onResize({ width: 320, height: 220 }));
  p = seen.bar.mock.lastCall?.[0];
  expect(p.axisBottom.tickValues).toEqual(['Apr', 'Jul', 'Sep']);
  expect(p.data).toEqual(data);
  expect(p.valueFormat(40.55)).toContain('40.55');
  expect(p.animate).toBe(false);
});
it('keeps first and last temporal labels, with real observations and no heavy animation', () => {
  render(<StaffLineChart {...props} />);
  const p = seen.line.mock.calls[0]?.[0];
  expect(p.data[0].data).toEqual([{ x: 'Sep', y: 40.55 }]);
  expect(p.axisBottom.tickValues).toEqual(['Sep']);
  expect(p.yScale.min).toBe(0);
  expect(p.animate).toBe(false);
  expect(p.enableArea).toBe(false);
});
it('omits zero slices and exposes a readable total without animation', () => {
  render(
    <StaffDonutChart
      title="Attendance"
      locale="en"
      data={[
        { id: 'Present', value: 3, color: '#14b8a6' },
        { id: 'Absent', value: 0, color: '#e879a2' },
      ]}
    />,
  );
  const p = seen.pie.mock.calls[0]?.[0];
  expect(p.role).toBe('presentation');
  expect(screen.getByRole('img', { name: 'Attendance' })).toBeVisible();
  expect(p.data).toHaveLength(1);
  expect(p.data[0].value).toBe(3);
  expect(p.animate).toBe(false);
});
