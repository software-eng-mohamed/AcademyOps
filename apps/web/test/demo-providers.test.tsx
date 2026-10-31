import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostHogPageView } from '@/components/analytics/posthog-pageview';
import { PostHogAnalyticsProvider } from '@/components/analytics/posthog-provider';
import { PostHogWebVitals } from '@/components/analytics/posthog-web-vitals';
import { Providers } from '@/components/providers';

vi.mock('@/components/analytics/posthog-provider', () => ({
  PostHogAnalyticsProvider: vi.fn(({ children }: { children: ReactNode }) => children),
}));
vi.mock('@/components/analytics/posthog-pageview', () => ({ PostHogPageView: vi.fn(() => null) }));
vi.mock('@/components/analytics/posthog-web-vitals', () => ({
  PostHogWebVitals: vi.fn(() => null),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('demo analytics isolation', () => {
  it('renders the demo without mounting analytics, page-view or vitals collectors', () => {
    render(
      <Providers disableAnalytics>
        <p>Academy demo</p>
      </Providers>,
    );
    expect(screen.getByText('Academy demo')).toBeInTheDocument();
    expect(PostHogAnalyticsProvider).not.toHaveBeenCalled();
    expect(PostHogPageView).not.toHaveBeenCalled();
    expect(PostHogWebVitals).not.toHaveBeenCalled();
  });

  it('retains the configured analytics providers for the full application', () => {
    render(
      <Providers>
        <p>Application</p>
      </Providers>,
    );
    expect(PostHogAnalyticsProvider).toHaveBeenCalled();
    expect(PostHogPageView).toHaveBeenCalled();
    expect(PostHogWebVitals).toHaveBeenCalled();
  });
});
