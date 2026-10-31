import { cleanup, render } from '@testing-library/react';
import { Profile2User } from 'iconsax-react';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardIconTile } from '@/components/application/dashboard/dashboard-icon-tile';

afterEach(cleanup);

describe('Shared dashboard icon tile', () => {
  it.each(['blue', 'orange', 'purple', 'pink', 'sky', 'emerald'] as const)(
    'renders the %s tile with the same decorative Iconsax size',
    (tone) => {
      const { container } = render(
        <DashboardIconTile tone={tone}>
          <Profile2User color="currentColor" size={20} variant="Bulk" />
        </DashboardIconTile>,
      );
      const tile = container.querySelector('[data-dashboard-icon-tone]');
      expect(tile).toHaveAttribute('data-dashboard-icon-tone', tone);
      expect(tile).toHaveAttribute('aria-hidden', 'true');
      expect(tile?.querySelector('svg')).toHaveAttribute('width', '20');
      expect(tile?.querySelector('svg')).toHaveAttribute('height', '20');
    },
  );

  it('defaults to the Sales blue when no tone is specified', () => {
    const { container } = render(
      <DashboardIconTile>
        <Profile2User />
      </DashboardIconTile>,
    );
    expect(container.querySelector('[data-dashboard-icon-tone]')).toHaveAttribute(
      'data-dashboard-icon-tone',
      'blue',
    );
  });
});
