import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedThemeToggler } from '@/components/base/buttons/animated-theme-toggler';

const theme = vi.hoisted(() => ({
  resolvedTheme: 'light',
  setTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => theme,
}));

describe('AnimatedThemeToggler', () => {
  beforeEach(() => {
    theme.resolvedTheme = 'light';
    theme.setTheme.mockReset();
    document.documentElement.classList.remove('dark');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
    delete document.documentElement.dataset.plgThemeTransition;
    document.documentElement.removeAttribute('style');
  });

  it('switches next-themes and the root class when View Transitions are unavailable', () => {
    render(
      <AnimatedThemeToggler
        darkThemeLabel="Switch to dark mode"
        lightThemeLabel="Switch to light mode"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(theme.setTheme).toHaveBeenCalledWith('dark');
  });

  it('announces the light-mode action when dark mode is active', () => {
    theme.resolvedTheme = 'dark';

    render(
      <AnimatedThemeToggler
        darkThemeLabel="Switch to dark mode"
        lightThemeLabel="Switch to light mode"
      />,
    );

    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the CSS reveal active until the View Transition finishes', async () => {
    let resolveTransitionFinished: () => void = () => {};
    const transitionFinished = new Promise<void>((resolve) => {
      resolveTransitionFinished = () => resolve();
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn((update: () => void) => {
        update();
        return { finished: transitionFinished };
      }),
    });

    render(
      <AnimatedThemeToggler
        darkThemeLabel="Switch to dark mode"
        lightThemeLabel="Switch to light mode"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(document.documentElement).toHaveAttribute('data-plg-theme-transition', 'active');
    expect(
      document.documentElement.style.getPropertyValue('--plg-theme-transition-clip-from'),
    ).toBe('circle(0% at 0% 0%)');
    expect(
      document.documentElement.style.getPropertyValue('--plg-theme-transition-clip-to'),
    ).not.toBe('');

    await act(async () => resolveTransitionFinished());
    expect(document.documentElement).not.toHaveAttribute('data-plg-theme-transition');
    expect(document.documentElement.style.getPropertyValue('--plg-theme-transition-clip-to')).toBe(
      '',
    );
  });
});
