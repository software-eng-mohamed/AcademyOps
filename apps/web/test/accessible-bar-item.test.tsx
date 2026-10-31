import { Bar } from '@nivo/bar';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AccessibleBarItem } from '@/features/dashboard/overview/accessible-bar-item';

afterEach(cleanup);

it('names the actual focusable Nivo bar and keeps its keyboard tooltip', () => {
  render(
    <Bar
      width={300}
      height={180}
      data={[{ month: 'September', completed: 3 }]}
      keys={['completed']}
      indexBy="month"
      animate={false}
      enableLabel={false}
      isFocusable
      role="img"
      ariaLabel="Completed sessions"
      barComponent={AccessibleBarItem}
      barAriaLabel={(bar) => `${bar.indexValue}, completed: ${bar.value}`}
      tooltip={({ value }) => <span>Completed sessions: {value}</span>}
    />,
  );

  const bar = screen.getByRole('img', { name: 'September, completed: 3' });
  expect(bar.tagName.toLowerCase()).toBe('rect');
  expect(bar).toHaveAttribute('tabindex', '0');
  fireEvent.focus(bar);
  expect(screen.getByText('Completed sessions: 3')).toBeInTheDocument();
  fireEvent.blur(bar);
  expect(screen.queryByText('Completed sessions: 3')).not.toBeInTheDocument();
});
