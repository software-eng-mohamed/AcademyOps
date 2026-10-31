import { PlgMotionProvider } from '@academyops/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutiveDrilldownDrawer } from '@/features/dashboard/overview/executive-drilldown-drawer';
import { OwnerMetrics } from '@/features/dashboard/overview/owner-metrics';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import { mockOverview } from './fixtures/owner-overview';

beforeEach(() => {
  for (const name of ['ResizeObserver', 'IntersectionObserver']) {
    vi.stubGlobal(
      name,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OwnerMetrics Executive Drilldown', () => {
  it('shows recorded monthly analytics without invented years, targets or campuses', async () => {
    const onClose = vi.fn();
    render(
      <PlgMotionProvider>
        <ExecutiveDrilldownDrawer
          locale="ar"
          metricKey="netCollections"
          onClose={onClose}
          overview={mockOverview}
        />
      </PlgMotionProvider>,
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('صافي التحصيلات والإيرادات')).toBeInTheDocument();
    expect(screen.getByText('فبراير ٢٠٢٦')).toBeInTheDocument();
    expect(screen.getByText('يناير ٢٠٢٦')).toBeInTheDocument();
    expect(screen.getByText('+18.1%')).toBeInTheDocument();
    expect(screen.queryByText('2026 (YTD)')).not.toBeInTheDocument();
    expect(screen.queryByText('المقر الرئيسي (مدينة نصر)')).not.toBeInTheDocument();
    expect(screen.getByText('المستهدفات ومساهمات الفروع غير متاحة لهذا المؤشر.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'عرض الحسابات المالية' })).toHaveAttribute(
      'href',
      '/ar/finance',
    );
  });

  it('renders all executive cards and opens drilldown drawer upon clicking net collections', async () => {
    const copy = getDashboardOverviewCopy('ar');
    render(
      <PlgMotionProvider>
        <OwnerMetrics copy={copy} isFetching={false} locale="ar" overview={mockOverview} />
      </PlgMotionProvider>,
    );

    // Verify KPI cards rendered
    expect(screen.getByText(copy.kpis.netCollections)).toBeInTheDocument();
    expect(screen.getByText(copy.kpis.overdueReceivables)).toBeInTheDocument();

    // Click on Net Collections drilldown button to open executive drawer
    const netCollectionsCard = screen
      .getByText(copy.kpis.netCollections)
      .closest('[data-slot="card"]');
    expect(netCollectionsCard).toBeDefined();
    if (!netCollectionsCard) throw new Error('Card not found');
    const netCollectionsButton = netCollectionsCard.querySelector('button');
    expect(netCollectionsButton).toBeDefined();
    if (!netCollectionsButton) throw new Error('Button not found');
    fireEvent.click(netCollectionsButton);

    // Executive drawer should appear with title and comparative analysis
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('صافي التحصيلات والإيرادات')).toBeInTheDocument();
    expect(screen.getByText('فبراير ٢٠٢٦')).toBeInTheDocument();
  });

  it('opens drilldown drawer with overdue receivables analytics when clicking overdue card button', async () => {
    const copy = getDashboardOverviewCopy('ar');
    render(
      <PlgMotionProvider>
        <OwnerMetrics copy={copy} isFetching={false} locale="ar" overview={mockOverview} />
      </PlgMotionProvider>,
    );

    const overdueCard = screen
      .getByText(copy.kpis.overdueReceivables)
      .closest('[data-slot="card"]');
    expect(overdueCard).toBeDefined();
    if (!overdueCard) throw new Error('Card not found');
    const overdueButton = overdueCard.querySelector('button');
    expect(overdueButton).toBeDefined();
    if (!overdueButton) throw new Error('Button not found');
    fireEvent.click(overdueButton);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('المستحقات ومخاطر أعمار الديون')).toBeInTheDocument();
  });

  it('opens drilldown drawer when clicking on a chart card like enrollments', async () => {
    const copy = getDashboardOverviewCopy('ar');
    render(
      <PlgMotionProvider>
        <OwnerMetrics copy={copy} isFetching={false} locale="ar" overview={mockOverview} />
      </PlgMotionProvider>,
    );

    const enrollmentCard = screen
      .getByText(copy.charts.enrollmentsTitle)
      .closest('[data-slot="card"]');
    expect(enrollmentCard).toBeDefined();
    if (!enrollmentCard) throw new Error('Card not found');
    fireEvent.click(enrollmentCard);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent(copy.charts.enrollmentsTitle);
    expect(screen.getByRole('dialog')).toHaveTextContent('٦٢');
  });

  it('shows an explicit empty history while preserving a zero collection balance', async () => {
    const overview = structuredClone(mockOverview);
    overview.kpis.netCollectionsThisMonth = '0';
    overview.trends.collections = [];
    render(
      <PlgMotionProvider>
        <ExecutiveDrilldownDrawer
          locale="en"
          metricKey="netCollections"
          onClose={vi.fn()}
          overview={overview}
        />
      </PlgMotionProvider>,
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Monthly history is not available for this metric.')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/E£0/)).toBeVisible();
    expect(screen.queryByText(/1,250,000/)).not.toBeInTheDocument();
  });

  it('renders a small circular icon button inside Net Collections card without card-level button role', () => {
    const copy = getDashboardOverviewCopy('en');
    render(
      <PlgMotionProvider>
        <OwnerMetrics copy={copy} isFetching={false} locale="en" overview={mockOverview} />
      </PlgMotionProvider>,
    );

    const netCollectionsCard = screen
      .getByText(copy.kpis.netCollections)
      .closest('[data-slot="card"]');
    expect(netCollectionsCard).toBeDefined();
    if (!netCollectionsCard) throw new Error('Card not found');

    // The card itself should NOT be a button
    expect(netCollectionsCard).not.toHaveAttribute('role', 'button');

    // It should have a small circular button
    const button = netCollectionsCard.querySelector('button');
    expect(button).toBeDefined();
    if (!button) throw new Error('Button not found');
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('rounded-full');
    expect(button).toHaveClass('size-7');
    expect(button).toHaveAttribute('title', 'Compare & Drilldown');
    expect(button).toHaveAttribute(
      'aria-label',
      `${copy.kpis.netCollections} - Compare & Drilldown`,
    );

    // The text 'Compare & Drilldown' should not be rendered as plain text in the card body
    expect(netCollectionsCard.querySelector('span')?.textContent).not.toContain(
      'Compare & Drilldown',
    );
  });
});
