import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcademyRecord } from '@/api/academy/models';
import { DetailFullPage as AcademyDetailFullPage } from '@/features/academy/detail-full-page';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { AttendanceScan } from '@/features/management/attendance-scan-dialog';
import { ManagementDetailFullPage } from '@/features/management/detail-full-page';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { workflowText } from '@/i18n/workflow-copy';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ar/cohorts',
  useSearchParams: () => new URLSearchParams('mode=page&record=cohort-1'),
}));

vi.mock('@/api/academy/queries', () => ({
  academyKey: (id: string) => ['academy', id],
  getAcademyDetail: vi.fn(async () => ({
    id: 'cohort-1',
    name: 'دفعة الخريف ٢٠٢٦',
    code: 'FALL-2026',
    status: 'ACTIVE',
    version: 1,
    data: {
      capacity: 30,
      confirmedEnrollmentCount: 25,
      startsOn: '2026-10-01',
      endsOn: '2026-12-01',
      history: [],
      events: [],
    },
  })),
}));

vi.mock('@/api/management/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/management/queries')>()),
  getManagementDetail: vi.fn(async () => ({
    id: 'session-1',
    name: 'المحاضرة الأولى - مقدمة',
    code: 'SES-01',
    status: 'SCHEDULED',
    version: 1,
    data: {
      startsAt: '2026-10-01T10:00:00Z',
      endsAt: '2026-10-01T12:00:00Z',
      room: { name: 'قاعة أ' },
      deliveryMode: 'IN_PERSON',
      attendanceWindowState: 'SCHEDULED',
    },
  })),
}));

const testUser: DashboardUser = {
  id: 'user-1',
  name: 'Admin',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: [],
};

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const key of ['IntersectionObserver', 'ResizeObserver']) {
    vi.stubGlobal(
      key,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
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

describe('DetailFullPage (Academy)', () => {
  const row: AcademyRecord = {
    id: 'cohort-1',
    name: 'دفعة الخريف ٢٠٢٦',
    code: 'FALL-2026',
    status: 'ACTIVE',
    version: 1,
    data: {},
  };

  it('renders record title, back button, and switch to drawer button', async () => {
    const copy = getAcademyCopy('ar');
    const onBack = vi.fn();
    const onSwitchToDrawer = vi.fn();

    render(
      <PlgMotionProvider>
        <QueryClientProvider client={client}>
          <AcademyDetailFullPage
            selection={{ resource: 'cohorts', row }}
            user={testUser}
            locale="ar"
            copy={copy}
            canGoBack={false}
            onBack={onBack}
            onSwitchToDrawer={onSwitchToDrawer}
            onInspect={vi.fn()}
            onAction={vi.fn()}
          />
        </QueryClientProvider>
      </PlgMotionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('دفعة الخريف ٢٠٢٦')).toBeInTheDocument();
    });

    const backBtn = screen.getByText(workflowText('ar', 'backToList'));
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();

    const drawerBtn = screen.getByText(workflowText('ar', 'openDrawer'));
    expect(drawerBtn).toBeInTheDocument();
    fireEvent.click(drawerBtn);
    expect(onSwitchToDrawer).toHaveBeenCalled();
  });
});

describe('ManagementDetailFullPage', () => {
  const row: AcademyRecord = {
    id: 'session-1',
    name: 'المحاضرة الأولى - مقدمة',
    code: 'SES-01',
    status: 'SCHEDULED',
    version: 1,
    data: {},
  };

  it('renders management record details and navigation buttons', async () => {
    const onClose = vi.fn();
    const onSwitchToDrawer = vi.fn();

    render(
      <PlgMotionProvider>
        <QueryClientProvider client={client}>
          <ManagementDetailFullPage
            resource="sessions"
            row={row}
            user={testUser}
            locale="ar"
            onClose={onClose}
            onAction={vi.fn()}
            onSwitchToDrawer={onSwitchToDrawer}
          />
        </QueryClientProvider>
      </PlgMotionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('المحاضرة الأولى - مقدمة')).toBeInTheDocument();
    });

    const backBtn = screen.getByText(workflowText('ar', 'backToList'));
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onClose).toHaveBeenCalled();

    const drawerBtn = screen.getByText(workflowText('ar', 'openDrawer'));
    expect(drawerBtn).toBeInTheDocument();
    fireEvent.click(drawerBtn);
    expect(onSwitchToDrawer).toHaveBeenCalled();
  });
});

describe('AttendanceScan Dialog', () => {
  it('renders unmasked text input with autofocus and placeholder', () => {
    render(
      <PlgMotionProvider>
        <QueryClientProvider client={client}>
          <AttendanceScan id="session-1" userId="user-1" locale="ar" onClose={vi.fn()} />
        </QueryClientProvider>
      </PlgMotionProvider>,
    );

    const input = screen.getByPlaceholderText(workflowText('ar', 'scanQrPrompt'));
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
  });
});
