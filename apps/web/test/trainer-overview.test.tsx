import { PlgMotionProvider } from '@academyops/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrainerOverview } from '@/features/dashboard/overview/staff-learning-overviews';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';

vi.mock('@/features/dashboard/overview/staff-overview-charts', () => ({
  StaffBarChart: () => null,
  StaffLineChart: () => null,
  StaffDonutChart: () => null,
}));
afterEach(cleanup);
describe('Trainer overview shared navigation', () => {
  it.each(['en', 'ar'] as const)('links next, agenda and recent sessions in %s', (locale) => {
    const session = {
      id: 'next-session',
      title: 'Next synthetic class',
      room: null,
      startsAt: '2026-09-06T12:00:00Z',
      endsAt: '2026-09-06T14:00:00Z',
      status: 'SCHEDULED',
      deliveryMode: 'ONLINE',
    };
    render(
      <PlgMotionProvider>
        <TrainerOverview
          locale={locale}
          data={{
            kind: 'TRAINER',
            nextSession: session,
            days: [{ date: '2026-09-06', minutes: 120, sessions: 1 }],
            deliveryModes: [],
            recentSessions: [
              {
                ...session,
                id: 'recent-session',
                title: 'Recent synthetic class',
                status: 'COMPLETED',
              },
            ],
          }}
          queue={{
            kind: 'UPCOMING',
            total: 1,
            items: [
              {
                id: 'agenda-session',
                title: 'Agenda synthetic class',
                at: session.startsAt,
                status: 'SCHEDULED',
                subtitle: null,
                amount: null,
              },
            ],
          }}
        />
      </PlgMotionProvider>,
    );
    expect(screen.getByRole('link', { name: getAcademyCopy(locale).details })).toHaveAttribute(
      'href',
      `/${locale}/sessions?record=next-session`,
    );
    expect(
      screen.getByRole('link', { name: managementText(locale, 'attendance') }),
    ).toHaveAttribute('href', `/${locale}/attendance?sessionId=next-session`);
    expect(screen.getByRole('link', { name: /Agenda synthetic class/ })).toHaveAttribute(
      'href',
      `/${locale}/sessions?record=agenda-session`,
    );
    expect(screen.getByRole('link', { name: 'Recent synthetic class' })).toHaveAttribute(
      'href',
      `/${locale}/sessions?record=recent-session`,
    );
    expect(screen.queryByText(getStaffOverviewCopy(locale).trainer.noRoom)).not.toBeInTheDocument();
  });
  it.each(['en', 'ar'] as const)(
    'has a useful empty state in %s without fabricated sessions',
    (locale) => {
      render(
        <PlgMotionProvider>
          <TrainerOverview
            locale={locale}
            queue={null}
            data={{
              kind: 'TRAINER',
              nextSession: null,
              days: [],
              deliveryModes: [],
              recentSessions: [],
            }}
          />
        </PlgMotionProvider>,
      );
      expect(screen.getByText(getStaffOverviewCopy(locale).trainer.nextEmpty)).toBeVisible();
      expect(
        screen.queryByRole('link', { name: getAcademyCopy(locale).details }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: managementText(locale, 'sessions') }),
      ).toHaveAttribute('href', `/${locale}/sessions`);
    },
  );
});
