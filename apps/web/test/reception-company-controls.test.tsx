import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagementDetail } from '@/features/management/detail-drawer';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { receptionUser } from './reception-user.fixture';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe('Reception company details after the shared Sales changes', () => {
  it.each(
    (['en', 'ar'] as const).flatMap((locale) =>
      [true, false].map((canReadBalance) => ({ locale, canReadBalance })),
    ),
  )(
    'keeps companies read-only in $locale (balance grant: $canReadBalance)',
    async ({ locale, canReadBalance }) => {
      const request = vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes('/billing-accounts/')
                ? {
                    balance: '120.50',
                    totalDebits: '150.50',
                    totalCredits: '30.00',
                    outstandingDebits: '120.50',
                    unappliedCredits: '0.00',
                  }
                : {
                    id: 'company',
                    displayName: 'Reception company',
                    legalName: 'Reception company Ltd',
                    status: 'ACTIVE',
                    version: 1,
                    contacts: [],
                    billingAccount: { id: 'company-billing' },
                  },
            ),
            { headers: { 'content-type': 'application/json' } },
          ),
      );
      vi.stubGlobal('fetch', request);
      const user = canReadBalance
        ? receptionUser
        : {
            ...receptionUser,
            permissions: receptionUser.permissions.filter(
              ({ code }) => code !== 'finance.balance.read',
            ),
          };
      render(
        <QueryClientProvider client={client}>
          <PlgMotionProvider>
            <ManagementDetail
              resource="businessAccounts"
              row={{
                id: 'company',
                name: 'Reception company',
                code: '',
                status: 'ACTIVE',
                version: 1,
                data: {},
              }}
              user={user}
              locale={locale}
              onClose={vi.fn()}
              onAction={vi.fn()}
            />
          </PlgMotionProvider>
        </QueryClientProvider>,
      );
      await screen.findByRole('heading', { name: getAcademyCopy(locale).details });
      const summary = { name: managementText(locale, 'financeSummary') };
      if (canReadBalance) {
        expect(await screen.findByRole('heading', summary)).toBeVisible();
        const amount = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' }).format(
          120.5,
        );
        expect(screen.getAllByText(amount, { normalizer: (value) => value })).toHaveLength(2);
      } else {
        expect(screen.queryByRole('heading', summary)).not.toBeInTheDocument();
      }
      expect(request.mock.calls.filter(([url]) => url.includes('/billing-accounts/'))).toHaveLength(
        canReadBalance ? 1 : 0,
      );
      for (const action of ['editAccount', 'editContacts'])
        expect(
          screen.queryByRole('button', { name: managementText(locale, action) }),
        ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: getAcademyCopy(locale).actions }),
      ).not.toBeInTheDocument();
    },
  );
});
