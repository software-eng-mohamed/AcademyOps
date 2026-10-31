import type { StaffOverview } from '@academyops/api-client/workspace-overview';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaffOverviewContent } from '@/features/dashboard/overview/staff-overview-content';
import styles from '@/features/dashboard/overview/staff-overview-styles';
import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';
import { staffFixtures } from './staff-overview.fixture';
import { workspaceFixture } from './workspace-overview.fixture';

vi.mock('next/dynamic', () => ({ default: () => () => <div data-chart-slot /> }));
afterEach(cleanup);

const selector = (classNames: string | undefined) =>
  `.${(classNames ?? '').trim().split(/\s+/).join('.')}`;

describe('Distinct staff overview experiences', () => {
  it.each(
    Object.keys(staffFixtures).flatMap((kind) =>
      (['en', 'ar'] as const).map((locale) => ({ kind: kind as StaffOverview['kind'], locale })),
    ),
  )('renders the $kind experience in $locale with its own content', ({ kind, locale }) => {
    const c = getStaffOverviewCopy(locale);
    const titles = {
      OPERATIONS: c.operations.preparation,
      ACADEMIC: c.academic.groups,
      RECEPTION: c.reception.recent,
      ACCOUNTS: c.accounts.collections,
      ATTENDANCE: c.attendance.today,
      TRAINER: c.trainer.next,
      OTP_OPERATOR: c.otp.health,
    };
    const { container } = render(
      <StaffOverviewContent
        data={staffFixtures[kind]}
        overview={workspaceFixture(kind)}
        locale={locale}
      />,
    );
    expect(container.querySelector('[data-staff-layout]')).toHaveAttribute(
      'data-staff-layout',
      kind,
    );
    expect(screen.getByRole('heading', { name: titles[kind] })).toBeInTheDocument();
    for (const other of Object.keys(titles) as StaffOverview['kind'][]) {
      if (other !== kind)
        expect(screen.queryByRole('heading', { name: titles[other] })).not.toBeInTheDocument();
    }
    expect(container.querySelector('[data-chart-slot]')).toBeInTheDocument();
    expect(container.querySelectorAll('a[href="#"]')).toHaveLength(0);
    expect(container.querySelector(selector(styles.academicGrid)) !== null).toBe(
      kind === 'ACADEMIC',
    );
    expect(container.querySelector(selector(styles.operationsGrid)) !== null).toBe(
      kind === 'OPERATIONS',
    );
    expect(container.querySelector(selector(styles.receptionGrid)) !== null).toBe(
      kind === 'RECEPTION',
    );
    expect(container.querySelector(selector(styles.attendanceGrid)) !== null).toBe(
      kind === 'ATTENDANCE',
    );
    expect(container.querySelectorAll(selector(styles.trainerGrid))).toHaveLength(
      kind === 'TRAINER' ? 2 : 0,
    );
  });
  it('does not render a projection for the wrong role or Student', () => {
    const { container } = render(
      <StaffOverviewContent
        data={staffFixtures.ACCOUNTS}
        overview={workspaceFixture('STUDENT')}
        locale="en"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
  it.each(['en', 'ar'] as const)(
    'stacks Operations cards independently instead of leaving gaps between shared rows in %s',
    (locale) => {
      const c = getStaffOverviewCopy(locale);
      const { container } = render(
        <StaffOverviewContent
          data={staffFixtures.OPERATIONS}
          overview={workspaceFixture('OPERATIONS')}
          locale={locale}
        />,
      );
      const layout = container.querySelector('[data-staff-layout="OPERATIONS"]');
      expect(layout).toHaveClass(styles.grid ?? '');
      expect(layout).toHaveClass(styles.operationsGrid ?? '');
      expect(layout?.children).toHaveLength(2);
      const week = screen.getByRole('region', { name: c.weekAhead });
      const agenda = screen.getByRole('region', { name: c.operations.agenda });
      const preparation = screen.getByRole('region', { name: c.operations.preparation });
      const registrations = screen.getByRole('region', { name: c.operations.registrations });
      expect(week.parentElement).toBe(agenda.parentElement);
      expect(preparation.parentElement).toBe(registrations.parentElement);
      expect(week.parentElement).not.toBe(preparation.parentElement);
      expect(week.parentElement).toHaveClass(styles.stack ?? '');
      expect(preparation.parentElement).toHaveClass(styles.stack ?? '');
      expect(week.nextElementSibling).toBe(agenda);
      expect(preparation.nextElementSibling).toBe(registrations);
      expect(agenda.querySelector(selector(styles.foot))).toBeInTheDocument();
    },
  );
  it('aligns the Academic summary cards while keeping the agenda full width', () => {
    const c = getStaffOverviewCopy('en');
    const { container } = render(
      <StaffOverviewContent
        data={staffFixtures.ACADEMIC}
        overview={workspaceFixture('ACADEMIC')}
        locale="en"
      />,
    );
    const plan = screen.getByRole('region', { name: c.academic.plan });
    const groups = screen.getByRole('region', { name: c.academic.groups });
    expect(plan.parentElement).toBe(groups.parentElement);
    expect(plan.parentElement).toHaveClass(styles.academicGrid ?? '');
    expect(screen.getByRole('region', { name: c.academic.next }).parentElement).toBe(
      container.querySelector('[data-staff-layout="ACADEMIC"]'),
    );
  });
  it.each(
    (['en', 'ar'] as const).flatMap((locale) => [true, false].map((empty) => ({ locale, empty }))),
  )(
    'aligns Attendance cards and preserves content in $locale (empty: $empty)',
    ({ locale, empty }) => {
      const c = getStaffOverviewCopy(locale);
      const { container } = render(
        <StaffOverviewContent
          data={
            empty
              ? { kind: 'ATTENDANCE', days: [], recordsToday: [], windows: [] }
              : staffFixtures.ATTENDANCE
          }
          overview={workspaceFixture('ATTENDANCE')}
          locale={locale}
        />,
      );
      const today = screen.getByRole('region', { name: c.attendance.today });
      const trend = screen.getByRole('region', { name: c.attendance.trend });
      const agenda = screen.getByRole('region', { name: c.attendance.agenda });
      expect(today.parentElement).toBe(trend.parentElement);
      expect(today.parentElement).toHaveClass(styles.attendanceGrid ?? '');
      expect(today.parentElement?.children).toHaveLength(2);
      expect(today).toHaveTextContent(c.attendance.note);
      expect(trend).toHaveTextContent(c.attendance.windows);
      expect(agenda.parentElement).toBe(
        container.querySelector('[data-staff-layout="ATTENDANCE"]'),
      );
      if (empty) {
        expect(today.querySelector(selector(styles.empty))).toBeInTheDocument();
        expect(trend.querySelectorAll(selector(styles.empty))).toHaveLength(2);
        expect(today.querySelector('[data-chart-slot]')).not.toBeInTheDocument();
      } else {
        expect(today.querySelector(selector(styles.donut))).toBeInTheDocument();
        expect(trend.querySelector(selector(styles.chart))).toBeInTheDocument();
        expect(trend.querySelector(selector(styles.pills))).toHaveTextContent(c.states.OPEN ?? '');
      }
    },
  );
  it.each(['en', 'ar'] as const)(
    'stacks Reception cards independently with all content preserved in %s',
    (locale) => {
      const c = getStaffOverviewCopy(locale);
      const { container } = render(
        <StaffOverviewContent
          data={staffFixtures.RECEPTION}
          overview={workspaceFixture('RECEPTION')}
          locale={locale}
        />,
      );
      const layout = container.querySelector('[data-staff-layout="RECEPTION"]');
      const trend = screen.getByRole('region', { name: c.reception.trend });
      const recent = screen.getByRole('region', { name: c.reception.recent });
      const pipeline = screen.getByRole('region', { name: c.reception.states });
      const agenda = screen.getByRole('region', { name: c.reception.agenda });
      expect(layout).toHaveClass(styles.grid ?? '');
      expect(layout?.children).toHaveLength(2);
      expect(trend.parentElement).toBe(agenda.parentElement);
      expect(pipeline.parentElement).toBe(recent.parentElement);
      expect(trend.parentElement).not.toBe(pipeline.parentElement);
      expect(trend.parentElement).toHaveClass(styles.stack ?? '');
      expect(pipeline.parentElement).toHaveClass(styles.stack ?? '');
      expect(trend.nextElementSibling).toBe(agenda);
      expect(pipeline.nextElementSibling).toBe(recent);
      expect(recent.querySelectorAll('li')).toHaveLength(1);
      expect(recent).toHaveTextContent('English basics');
      expect(layout).toHaveClass(styles.receptionGrid ?? '');
      expect(agenda.querySelector(selector(styles.foot))).toBeInTheDocument();
    },
  );
});
