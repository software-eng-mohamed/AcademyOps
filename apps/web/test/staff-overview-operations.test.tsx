import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SalesOverviewInsights } from '@/features/dashboard/overview/sales-overview-insights';
import { StaffOverviewContent } from '@/features/dashboard/overview/staff-overview-content';
import styles from '@/features/dashboard/overview/staff-overview-styles';
import { SeriesChart, staffMoney } from '@/features/dashboard/overview/staff-overview-ui';
import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';
import type { Locale } from '@/lib/locales';
import { staffFixtures } from './staff-overview.fixture';
import { workspaceFixture } from './workspace-overview.fixture';

vi.mock('next/dynamic', () => ({ default: () => () => <div data-chart-slot /> }));
afterEach(cleanup);

const selector = (classNames: string | undefined) =>
  `.${(classNames ?? '').trim().split(/\s+/).join('.')}`;

describe('Distinct staff overview experiences', () => {
  it.each(
    (['en', 'ar'] as const).flatMap((locale) => [true, false].map((empty) => ({ locale, empty }))),
  )('aligns both Trainer rows in $locale (empty: $empty)', ({ locale, empty }) => {
    const c = getStaffOverviewCopy(locale);
    const fixture = staffFixtures.TRAINER;
    if (fixture.kind !== 'TRAINER' || !fixture.nextSession)
      throw new Error('Invalid Trainer fixture');
    const { container } = render(
      <StaffOverviewContent
        data={
          empty
            ? {
                kind: 'TRAINER',
                days: [],
                deliveryModes: [],
                nextSession: null,
                recentSessions: [],
              }
            : {
                ...fixture,
                recentSessions: [
                  {
                    ...fixture.nextSession,
                    id: 'completed-1',
                    title: 'Completed class',
                    status: 'COMPLETED',
                  },
                ],
              }
        }
        overview={
          empty
            ? { ...workspaceFixture('TRAINER'), queue: { kind: 'UPCOMING', items: [], total: 0 } }
            : workspaceFixture('TRAINER')
        }
        locale={locale}
      />,
    );
    const next = screen.getByRole('region', { name: c.trainer.next });
    const workload = screen.getByRole('region', { name: c.trainer.workload });
    const agenda = screen.getByRole('region', { name: c.trainer.agenda });
    const recent = screen.getByRole('region', { name: c.trainer.recent });
    expect(next.parentElement).toBe(workload.parentElement);
    expect(agenda.parentElement).toBe(recent.parentElement);
    expect(next.parentElement).not.toBe(agenda.parentElement);
    for (const row of [next.parentElement, agenda.parentElement]) {
      expect(row).toHaveClass(styles.trainerGrid ?? '');
      expect(row?.children).toHaveLength(2);
      expect(row?.parentElement).toBe(container.querySelector('[data-staff-layout="TRAINER"]'));
    }
    expect(next.parentElement).toHaveClass(styles.equal ?? '');
    expect(next).toHaveTextContent(c.trainer.formats);
    expect(workload).toHaveTextContent(c.trainer.hours);
    expect(agenda.querySelector(selector(styles.foot))).toBeInTheDocument();
    if (empty) {
      expect(next).toHaveTextContent(c.trainer.nextEmpty);
      expect(next.querySelectorAll(selector(styles.empty))).toHaveLength(2);
      expect(workload.querySelector('[data-chart-slot]')).not.toBeInTheDocument();
      expect(recent.querySelector(selector(styles.empty))).toBeInTheDocument();
    } else {
      expect(next).toHaveTextContent('Speaking practice');
      expect(workload.querySelector(selector(styles.chart))).toBeInTheDocument();
      expect(agenda).toHaveTextContent('Group A');
      expect(recent).toHaveTextContent('Completed class');
    }
  });
  it.each(['en', 'ar'] as const)('hides the zero-of-zero Reception footer in %s', (locale) => {
    const c = getStaffOverviewCopy(locale);
    render(
      <StaffOverviewContent
        data={staffFixtures.RECEPTION}
        overview={{
          ...workspaceFixture('RECEPTION'),
          queue: { kind: 'TODAY', items: [], total: 0 },
        }}
        locale={locale}
      />,
    );
    const agenda = screen.getByRole('region', { name: c.reception.agenda });
    expect(agenda.querySelector(selector(styles.empty))).toBeInTheDocument();
    expect(agenda.querySelector(selector(styles.foot))).not.toBeInTheDocument();
  });
  it('preserves a non-zero queue total even if no Reception rows are shown', () => {
    render(
      <StaffOverviewContent
        data={staffFixtures.RECEPTION}
        overview={{
          ...workspaceFixture('RECEPTION'),
          queue: { kind: 'TODAY', items: [], total: 3 },
        }}
        locale="en"
      />,
    );
    expect(screen.getByText('Showing 0 of 3')).toBeInTheDocument();
  });
  it('keeps currency cents and separates pending from posted figures', () => {
    render(
      <StaffOverviewContent
        data={staffFixtures.ACCOUNTS}
        overview={workspaceFixture('ACCOUNTS')}
        locale="en"
      />,
    );
    expect(
      screen.getAllByText(staffMoney('40.55', 'en'), { normalizer: (s) => s }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(staffMoney('9.75', 'en'), { normalizer: (s) => s }),
    ).toBeInTheDocument();
  });
  it.each(['en', 'ar'] as const)('links Accounts queues to actionable records in %s', (locale) => {
    const { container } = render(
      <StaffOverviewContent
        data={staffFixtures.ACCOUNTS}
        overview={workspaceFixture('ACCOUNTS')}
        locale={locale}
      />,
    );
    for (const path of [
      'payments?status=PENDING_VERIFICATION',
      'payments?record=session-a',
      'finance',
      'documents',
    ]) {
      expect(container.querySelector(`a[href="/${locale}/${path}"]`)).toBeInTheDocument();
    }
  });
  it('does not present a fake chart when every value is zero', () => {
    const { container } = render(
      <SeriesChart
        title="Test"
        locale="en"
        data={[{ label: '2 Sep', count: 0 }]}
        series={[{ id: 'count', label: 'Count', color: '#3b82f6' }]}
      />,
    );
    expect(screen.getByText(getStaffOverviewCopy('en').noData)).toBeInTheDocument();
    expect(container.querySelector('[data-chart-slot]')).not.toBeInTheDocument();
  });
  it.each(['en', 'ar'] as Locale[])(
    'renders all six actual sales states in %s without inventing a conversion rate',
    (locale) => {
      const c = getStaffOverviewCopy(locale);
      render(
        <SalesOverviewInsights
          locale={locale}
          data={{
            states: [
              { key: 'WON', value: 4 },
              { key: 'DISQUALIFIED', value: 2 },
            ],
            days: [{ date: '2026-09-02', count: 6 }],
            sources: [{ source: 'Referral', count: 6 }],
            withoutNextAction: 1,
          }}
        />,
      );
      expect(screen.getByText(c.states.WON ?? '')).toBeInTheDocument();
      expect(screen.getByText(c.states.DISQUALIFIED ?? '')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: c.sales.pipeline })).toBeInTheDocument();
      expect(screen.getByText('Referral')).toBeInTheDocument();
    },
  );
  it('labels dispatch attempts as pending work, not delivered messages', () => {
    render(
      <StaffOverviewContent
        data={staffFixtures.OTP_OPERATOR}
        overview={workspaceFixture('OTP_OPERATOR')}
        locale="en"
      />,
    );
    expect(screen.getByText(getStaffOverviewCopy('en').otp.note)).toBeInTheDocument();
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument();
  });
});
