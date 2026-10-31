import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinancialEnrollment } from '@/features/management/financial-enrollment';
import { managementText } from '@/i18n/management-copy';
import { accountsUser } from './accounts-user.fixture';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/api/generated/enrollment/enrollment', () => ({ enrollmentControllerReadV1: read }));
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  vi.resetAllMocks();
});

describe('Accounts financial enrollment context', () => {
  it.each(['en', 'ar'] as const)(
    'resolves related names and a record link in %s',
    async (locale) => {
      client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      read.mockResolvedValue({
        data: {
          student: { name: 'Synthetic student' },
          program: { name: 'Synthetic course' },
          cohort: { name: 'Synthetic cohort' },
        },
      });
      render(
        <QueryClientProvider client={client}>
          <PlgMotionProvider>
            <FinancialEnrollment enrollmentId="enrollment-a" user={accountsUser} locale={locale} />
          </PlgMotionProvider>
        </QueryClientProvider>,
      );
      expect(await screen.findByText('Synthetic student')).toBeInTheDocument();
      expect(screen.getByText('Synthetic course')).toBeInTheDocument();
      expect(screen.getByText('Synthetic cohort')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: managementText(locale, 'openEnrollment') }),
      ).toHaveAttribute('href', `/${locale}/enrollments?record=enrollment-a`);
      expect(read).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledWith(
        'enrollment-a',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    },
  );
  it.each([
    { permissions: [] },
    { permissions: [{ code: 'enrollments.read' as const, scopes: ['S' as const] }] },
  ])('does not request enrollment without staff-scope permission', ({ permissions }) => {
    client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <FinancialEnrollment
          enrollmentId="enrollment-a"
          user={{ ...accountsUser, permissions }}
          locale="en"
        />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(read).not.toHaveBeenCalled();
  });
});
