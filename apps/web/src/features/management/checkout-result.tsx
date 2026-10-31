'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { textValue } from '@/api/academy/models';
import { academyKey } from '@/api/academy/queries';
import { financeControllerPaymobCheckoutStatusV1 } from '@/api/generated/finance/finance';
import { managementKey } from '@/api/management/queries';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import type { Locale } from '@/lib/locales';
import { ManagementFacts } from './presentation';

export function safeCheckoutUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function CheckoutResult({
  result,
  userId,
  locale,
  paymentPath = 'payments',
}: {
  result: Record<string, unknown>;
  userId: string;
  locale: Locale;
  paymentPath?: 'payments' | 'finance';
}) {
  const client = useQueryClient();
  const copy = getAcademyCopy(locale);
  const t = (key: string) => managementText(locale, key);
  const attemptId = textValue(result.attemptId);
  // Refresh only reads status; it must never create another payment attempt.
  const refresh = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: async () => (await financeControllerPaymobCheckoutStatusV1(attemptId)).data,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: managementKey(userId) }),
        client.invalidateQueries({ queryKey: academyKey(userId) }),
        client.invalidateQueries({ queryKey: ['student', userId] }),
        client.invalidateQueries({
          predicate: (query) =>
            query.queryKey.some((part) => typeof part === 'string' && part.includes('/dashboard/')),
        }),
      ]);
    },
  });
  const current = { ...result, ...refresh.data };
  const url =
    current.status === 'PENDING' && !refresh.isError
      ? safeCheckoutUrl(result.checkoutUrl)
      : undefined;
  const paymentId = textValue(current.paymentId);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-muted">{t('checkoutHint')}</p>
      <ManagementFacts data={current} names={['status', 'amount']} locale={locale} />
      <div className="flex flex-wrap gap-3">
        {url ? (
          <ButtonLink href={url} target="_blank" rel="noopener noreferrer" variant="secondary">
            {t('openCheckout')}
          </ButtonLink>
        ) : null}
        {attemptId ? (
          <Button variant="secondary" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? copy.loading : t('refreshCheckout')}
          </Button>
        ) : null}
        {current.status === 'SUCCEEDED' && paymentId ? (
          <ButtonLink
            variant="secondary"
            href={`/${locale}/${paymentPath}?${paymentPath === 'finance' ? 'tab=payments&' : ''}record=${encodeURIComponent(paymentId)}`}
          >
            {t('viewPayment')}
          </ButtonLink>
        ) : null}
      </div>
      {refresh.isError ? <ErrorNotice error={refresh.error} copy={copy} /> : null}
    </div>
  );
}
