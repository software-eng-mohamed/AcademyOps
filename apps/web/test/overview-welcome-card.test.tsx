import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OverviewWelcomeCard } from '@/features/dashboard/overview/overview-welcome-card';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';

afterEach(cleanup);

describe('Overview welcome card', () => {
  it.each(['en', 'ar'] as const)(
    'groups the %s heading, greeting and notifications in one card',
    (locale) => {
      const copy = getDashboardOverviewCopy(locale);
      const welcome = copy.welcome.replace('{name}', 'Development');
      const { container } = render(
        <OverviewWelcomeCard
          actions={<button type="button">Notifications</button>}
          title={copy.pageTitle}
          greeting={copy.welcome}
          description={copy.welcomeDescription}
          userName="Development Owner"
        />,
      );
      const card = container.querySelector('[data-overview-welcome]');
      expect(card).toContainElement(screen.getByRole('heading', { name: welcome, level: 1 }));
      expect(card).toContainElement(screen.getByText(copy.pageTitle));
      expect(card).toContainElement(screen.getByText(copy.welcomeDescription));
      expect(card?.querySelector('h1 bdi')).toHaveTextContent('Development');
      expect(card).toContainElement(screen.getByRole('button', { name: 'Notifications' }));
    },
  );
});
