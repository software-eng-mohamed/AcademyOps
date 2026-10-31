import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { academySections } from '@/api/academy/models';
import { getAcademyPage } from '@/api/academy/queries';
import { AcademyPage } from '@/features/academy/academy-page';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { academyLabel, getAcademyCopy } from '@/i18n/academy-copy';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/api/academy/queries', () => ({
  academyKey: (id: string) => ['academy', id],
  getAcademyContext: vi.fn(async () => ({ branches: [] })),
  getAcademyPage: vi.fn(async () => ({ items: [], nextCursor: null })),
  getAssignees: vi.fn(async () => []),
}));

const owner: DashboardUser = {
  id: 'owner-1',
  name: 'Owner',
  branches: [],
  organization: { name: 'Academy' },
  permissions: [],
  roles: [{ code: 'OWNER', name: 'Owner' }],
};
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe('Academy page with real library controls', () => {
  it.each(academySections)(
    'renders %s without collecting select options into its tabs',
    async (section) => {
      window.history.replaceState(null, '', `/en/${section}`);
      const copy = getAcademyCopy('en');
      render(
        <QueryClientProvider client={client}>
          <PlgMotionProvider>
            <AcademyPage section={section} user={owner} />
          </PlgMotionProvider>
        </QueryClientProvider>,
      );
      expect(await screen.findByRole('heading', { name: copy.noResults })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: academyLabel(copy, section), level: 1 }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(
        section === 'leads' ? 2 : section === 'resources' ? 3 : 1,
      );
      expect(screen.queryByRole('tab', { name: copy.allStatuses })).not.toBeInTheDocument();
      if (section === 'enrollments') {
        const statusLabel = screen.getByText(copy.selectStatus, { selector: 'label' });
        const studentLabel = screen.getByText(copy.selectStudent, { selector: 'label' });
        expect(statusLabel).toBeVisible();
        expect(statusLabel.className).toBe(studentLabel.className);
        expect(statusLabel.parentElement?.className).toBe(studentLabel.parentElement?.className);
        expect(screen.getByLabelText(copy.selectStatus).tagName).toBe('BUTTON');
      }
    },
  );

  it('switches from lead records to stages while keeping URL-backed selection and panel association', async () => {
    window.history.replaceState(null, '', '/en/leads');
    const copy = getAcademyCopy('en');
    render(
      <QueryClientProvider client={client}>
        <PlgMotionProvider>
          <AcademyPage section="leads" user={owner} />
        </PlgMotionProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: copy.noResults });
    fireEvent.mouseDown(screen.getByRole('tab', { name: copy.stages }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() => expect(window.location.search).toBe('?tab=stages'));
    expect(screen.getByRole('tab', { name: copy.stages })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: copy.stages })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: copy.stages })).toHaveAttribute(
      'aria-controls',
      screen.getByRole('tabpanel', { name: copy.stages }).id,
    );
    expect(vi.mocked(getAcademyPage).mock.calls.some(([resource]) => resource === 'stages')).toBe(
      true,
    );
  });

  it('keeps Arabic resource tabs independent when the trainer status filter appears', async () => {
    window.history.replaceState(null, '', '/ar/academic/resources');
    const copy = getAcademyCopy('ar');
    render(
      <QueryClientProvider client={client}>
        <PlgMotionProvider>
          <AcademyPage section="resources" user={owner} />
        </PlgMotionProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: copy.noResults });
    fireEvent.mouseDown(screen.getByRole('tab', { name: copy.trainers }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() => expect(window.location.search).toBe('?tab=trainers'));
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: copy.trainers })).toHaveAttribute(
      'aria-controls',
      screen.getByRole('tabpanel', { name: copy.trainers }).id,
    );
    expect(screen.getByRole('button', { name: new RegExp(copy.allStatuses) })).toBeInTheDocument();
  });
});
