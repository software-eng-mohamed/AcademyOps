import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StudentOverviewContent,
  studentMoney,
  studentWeekDays,
} from '@/features/dashboard/overview/student-overview-content';
import { getStudentOverviewCopy } from '@/i18n/student-overview-copy';
import { studentOverviewFixture } from './student-overview.fixture';

vi.mock('next/dynamic', () => ({ default: () => () => <div data-chart-slot /> }));
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Student overview details', () => {
  it.each(['ar', 'en'] as const)(
    'renders real schedule, fee precision and attendance in %s',
    (locale) => {
      const data = studentOverviewFixture();
      const copy = getStudentOverviewCopy(locale);
      render(<StudentOverviewContent data={data} locale={locale} />);
      expect(screen.getByRole('heading', { name: copy.nextSession })).toBeVisible();
      expect(
        within(screen.getByRole('region', { name: copy.nextSession })).getByText(
          'Conversation practice',
        ),
      ).toBeVisible();
      expect(screen.getByRole('tablist', { name: copy.schedule })).toBeVisible();
      expect(screen.getAllByRole('tab')).toHaveLength(7);
      expect(
        within(screen.getByRole('region', { name: copy.finance })).getAllByText(
          studentMoney('123.45', locale),
          { normalizer: (value) => value },
        ),
      ).toHaveLength(2);
      expect(screen.getByRole('heading', { name: copy.attendance })).toBeVisible();
      expect(
        screen.getByText(
          copy.counted
            .replace('{attended}', locale === 'ar' ? '٩' : '9')
            .replace('{total}', locale === 'ar' ? '١٠' : '10'),
        ),
      ).toBeVisible();
      expect(
        within(screen.getByRole('region', { name: copy.installments })).getByText(
          copy.states.OVERDUE ?? '',
        ),
      ).toBeVisible();
    },
  );
  it('switches timetable days using BoardUI tabs', async () => {
    render(<StudentOverviewContent data={studentOverviewFixture()} locale="en" />);
    expect(within(screen.getByRole('tabpanel')).getByText('Conversation practice')).toBeVisible();
    const first = screen.getByRole('tab', { name: /Wed\s*2/ });
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(
        within(screen.getByRole('tabpanel')).getByText('No sessions on this day'),
      ).toBeVisible(),
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: /Thu\s*3/ }), { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(within(screen.getByRole('tabpanel')).getByText('Conversation practice')).toBeVisible(),
    );
  });
  it('renders honest empty states without chart demo values', () => {
    const data = studentOverviewFixture();
    data.nextSession = null;
    data.schedule.items = [];
    data.schedule.total = 0;
    data.courses = { total: 0, items: [] };
    data.attendance = {
      numerator: 0,
      denominator: 0,
      ratio: null,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      unmarked: 0,
    };
    data.payments = { total: '0.00', months: [] };
    if (data.finance) data.finance.installments = { total: 0, items: [], overdueAmount: '0.00' };
    const { container } = render(<StudentOverviewContent data={data} locale="en" />);
    expect(screen.getByText('Your next session will appear here')).toBeVisible();
    expect(screen.getByText('No unpaid installments')).toBeVisible();
    expect(screen.getByText('No posted payments in this period.')).toBeVisible();
    expect(container.querySelector('[data-chart-slot]')).toBeNull();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
  it('does not turn forbidden finance or attendance into zero values', () => {
    const data = studentOverviewFixture();
    data.finance = null;
    data.attendance = null;
    data.payments = null;
    render(<StudentOverviewContent data={data} locale="en" />);
    expect(screen.getAllByText('This information isn’t available for your account.')).toHaveLength(
      4,
    );
    expect(screen.queryByText('Net balance due')).not.toBeInTheDocument();
  });
  it('labels negative net balances as credit instead of money owed', () => {
    const data = studentOverviewFixture();
    if (data.finance) data.finance.balance = '-12.55';
    render(<StudentOverviewContent data={data} locale="en" />);
    expect(screen.getByText('Credit balance')).toBeVisible();
    expect(
      screen.getByText(studentMoney('12.55', 'en'), { normalizer: (value) => value }),
    ).toBeVisible();
  });
  it('uses Cairo dates around midnight and across month boundaries', () => {
    const days = studentWeekDays('2026-08-31T21:00:00Z');
    expect(days[0]).toBe('2026-09-01T12:00:00.000Z');
    expect(days[6]).toBe('2026-09-07T12:00:00.000Z');
  });
});
