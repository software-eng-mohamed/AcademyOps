import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  StudentAttendanceChart,
  StudentPaymentsChart,
} from '@/features/dashboard/overview/student-overview-charts';
import { studentOverviewFixture } from './student-overview.fixture';

const charts = vi.hoisted(() => ({
  bar: vi.fn<(props: Record<string, unknown>) => null>(() => null),
  pie: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}));
vi.mock('@nivo/bar', () => ({ ResponsiveBar: charts.bar }));
vi.mock('@nivo/pie', () => ({ ResponsivePie: charts.pie }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('mirrors Arabic months and attendance segments without mutating the source', () => {
  const data = studentOverviewFixture();
  if (!data.payments || !data.attendance) throw new Error('Missing fixture');
  const source = JSON.stringify(data);
  render(
    <>
      <StudentPaymentsChart payments={data.payments} locale="ar" />
      <StudentAttendanceChart attendance={data.attendance} locale="ar" />
    </>,
  );
  const bar = charts.bar.mock.calls.at(-1)?.[0];
  const pie = charts.pie.mock.calls.at(-1)?.[0];
  if (!bar || !pie) throw new Error('Charts not rendered');
  expect(bar?.axisLeft).toBeNull();
  expect(bar?.axisRight).toBeTruthy();
  expect((bar.data as { amount: number }[])[0]?.amount).toBe(1876.55);
  expect((pie.data as { value: number }[]).map((v) => v.value)).toEqual([1, 9]);
  expect(JSON.stringify(data)).toBe(source);
});
it('plots paid receipt months chronologically with cents and a zero baseline, without motion', () => {
  const payments = studentOverviewFixture().payments;
  if (!payments) throw new Error('fixture missing payments');
  render(<StudentPaymentsChart payments={payments} locale="en" />);
  const props = charts.bar.mock.calls.at(-1)?.[0];
  expect(props).toMatchObject({
    animate: false,
    valueScale: { type: 'linear', min: 0 },
    isFocusable: true,
    data: [
      { label: 'Apr', amount: 0 },
      { label: 'May', amount: 0 },
      { label: 'Jun', amount: 0 },
      { label: 'Jul', amount: 0 },
      { label: 'Aug', amount: 0 },
      { label: 'Sep', amount: 1876.55 },
    ],
  });
});
it('shows counted attendance and missed sessions with stable colors and a labelled ratio', () => {
  const attendance = studentOverviewFixture().attendance;
  if (!attendance) throw new Error('fixture missing attendance');
  render(<StudentAttendanceChart attendance={attendance} locale="en" />);
  expect(charts.pie.mock.calls.at(-1)?.[0]).toMatchObject({
    role: 'presentation',
    animate: false,
    data: [
      { id: 'Attended / made up', value: 9, color: '#3b82f6' },
      { id: 'Missed', value: 1, color: '#f59e0b' },
    ],
  });
  expect(screen.getByRole('img', { name: 'Your attendance: 90%' })).toBeVisible();
  expect(screen.getByText('Missed: 1')).toBeVisible();
});
