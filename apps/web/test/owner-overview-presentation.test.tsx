import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CategoryAxisTick } from '@/features/dashboard/overview/category-axis-tick';
import { RecentActivity } from '@/features/dashboard/overview/overview-operations';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import { mockOverview } from './fixtures/owner-overview';

afterEach(cleanup);

it.each(['en', 'ar'] as const)(
  'localizes the actual student.create audit event in %s',
  (locale) => {
    const copy = getDashboardOverviewCopy(locale);
    render(
      <RecentActivity
        copy={copy}
        locale={locale}
        overview={{
          ...mockOverview,
          recentActivity: [
            {
              id: 'activity-1',
              actionCode: 'student.create',
              entityType: 'Person',
              entityId: 'student-1',
              actor: { name: 'Owner' },
              createdAt: '2026-10-30T12:00:00Z',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(locale === 'ar' ? 'تمت إضافة طالب' : 'Student added')).toBeVisible();
    expect(screen.getByText(locale === 'ar' ? 'الأشخاص' : 'People')).toBeVisible();
    expect(screen.queryByText('student.create')).not.toBeInTheDocument();
  },
);

it.each(['en', 'ar'] as const)(
  'keeps the complete long category label with %s direction',
  (locale) => {
    const label = getDashboardOverviewCopy(locale).attention.reasons.ATTENDANCE_BELOW_MINIMUM;
    const { container } = render(
      <svg role="img" aria-label="Category labels">
        <CategoryAxisTick tick={{ x: 0, y: 20, value: label }} isRtl={locale === 'ar'} />
      </svg>,
    );
    expect(screen.getByText(label ?? '')).toBeVisible();
    expect(screen.getByText(label ?? '').parentElement).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr',
    );
    const labelBox = container.querySelector('foreignObject');
    expect(labelBox).toHaveAttribute('x', locale === 'ar' ? '10' : '-132');
  },
);
