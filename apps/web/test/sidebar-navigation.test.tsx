import { PlgMotionProvider } from '@academyops/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardSidebar } from '@/components/application/dashboard/dashboard-sidebar';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';

vi.mock('next/navigation', () => ({ usePathname: () => '/en/dashboard' }));
// Model Next's documented event order: onClick runs on every click; onNavigate
// runs only for in-app navigation, after the browser's modified-click check.
vi.mock('next/link', () => ({
  default: ({
    onNavigate,
    onClick,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; onNavigate?: () => void }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0)
          onNavigate?.();
      }}
    />
  ),
}));
const owner: DashboardUser = {
  id: 'owner',
  name: 'Owner',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: [{ code: 'academic.catalog.read', scopes: ['O'] }],
};
beforeEach(() => {
  for (const name of ['ResizeObserver', 'IntersectionObserver'])
    vi.stubGlobal(
      name,
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
  vi.unstubAllGlobals();
});
function mount(close: () => void) {
  render(
    <PlgMotionProvider>
      <DashboardSidebar
        mobile
        locale="en"
        user={owner}
        expandedGroups={new Set(['academy'])}
        onExpandedGroupsChange={vi.fn()}
        logoutPending={false}
        onLanguageSwitch={vi.fn()}
        onLogout={vi.fn()}
        onNavigate={close}
      />
    </PlgMotionProvider>,
  );
}
describe('mobile sidebar navigation', () => {
  it('closes through the in-app navigation callback', () => {
    const close = vi.fn();
    mount(close);
    fireEvent.click(screen.getByRole('link', { name: 'Programs' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('does not close the menu for a modified click that opens another tab', () => {
    const close = vi.fn();
    mount(close);
    fireEvent.click(screen.getByRole('link', { name: 'Programs' }), { ctrlKey: true });
    expect(close).not.toHaveBeenCalled();
  });
});
