import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutResult, safeCheckoutUrl } from '@/features/management/checkout-result';
import { managementText } from '@/i18n/management-copy';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient();
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
describe('Accounts online checkout status', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://user:password@example.test/pay',
    'not a URL',
  ])('rejects unsafe link %s', (url) => expect(safeCheckoutUrl(url)).toBeUndefined());
  it.each(['en', 'ar'] as const)(
    'keeps a pending link separate from confirmed payment in %s',
    async (locale) => {
      const request = vi.fn(
        async (_url: string) =>
          new Response(
            JSON.stringify({
              attemptId: 'attempt',
              status: 'SUCCEEDED',
              amount: '60.00',
              currencyCode: 'EGP',
              paymentId: 'payment',
              updatedAt: '2026-09-06T12:00:00Z',
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      );
      vi.stubGlobal('fetch', request);
      render(
        <QueryClientProvider client={client}>
          <PlgMotionProvider>
            <CheckoutResult
              userId="accounts"
              locale={locale}
              result={{
                attemptId: 'attempt',
                status: 'PENDING',
                amount: '60.00',
                currencyCode: 'EGP',
                paymentId: null,
                checkoutUrl: 'https://gateway.invalid/pay',
              }}
            />
          </PlgMotionProvider>
        </QueryClientProvider>,
      );
      expect(
        screen.getByRole('link', { name: managementText(locale, 'openCheckout') }),
      ).toHaveAttribute('href', 'https://gateway.invalid/pay');
      expect(
        screen.queryByRole('link', { name: managementText(locale, 'viewPayment') }),
      ).not.toBeInTheDocument();
      expect(request).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: managementText(locale, 'refreshCheckout') }),
      );
      expect(
        await screen.findByRole('link', { name: managementText(locale, 'viewPayment') }),
      ).toHaveAttribute('href', `/${locale}/payments?record=payment`);
      expect(
        screen.queryByRole('link', { name: managementText(locale, 'openCheckout') }),
      ).not.toBeInTheDocument();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]?.[0]).toContain('/payment-gateway-attempts/attempt');
    },
  );
});
