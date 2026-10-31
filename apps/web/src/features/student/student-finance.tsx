'use client';
import { PlgApiError } from '@academyops/api-client/http';
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from '@academyops/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { financeControllerEnrollmentSummaryV1 } from '@/api/generated/finance/finance';
import { createStudentCheckout, getStudentInstallments, studentKey } from '@/api/student/queries';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-styles';
import { AcademyTable } from '@/features/academy/academy-table';
import { ErrorNotice, formatAcademyDate } from '@/features/academy/academy-ui';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission } from '@/features/dashboard/navigation';
import { CheckoutResult } from '@/features/management/checkout-result';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { studentText } from '@/i18n/student-copy';
import type { Locale } from '@/lib/locales';
import { studentMoney } from './formatters';

export function StudentFinance({
  enrollmentId,
  user,
  locale,
}: {
  enrollmentId: string;
  user: DashboardUser;
  locale: Locale;
}) {
  const copy = getAcademyCopy(locale);
  const t = (key: Parameters<typeof studentText>[1]) => studentText(locale, key);
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const balance = useQuery({
    queryKey: [...studentKey(user.id), 'balance', enrollmentId],
    queryFn: ({ signal }) => financeControllerEnrollmentSummaryV1(enrollmentId, { signal }),
  });
  const installments = useQuery({
    queryKey: [...studentKey(user.id), 'installments', enrollmentId, cursor],
    queryFn: ({ signal }) => getStudentInstallments(enrollmentId, cursor, signal),
  });
  const data = balance.data?.data;
  return (
    <>
      <section className={styles.detailSection}>
        <h3>{t('finance')}</h3>
        {balance.isError ? (
          <ErrorNotice error={balance.error} copy={copy} retry={() => void balance.refetch()} />
        ) : balance.isPending ? (
          <p role="status">{copy.loading}</p>
        ) : data ? (
          <dl className={styles.facts}>
            {[
              [
                Number(data.balance) < 0 ? t('credit') : t('balance'),
                String(Math.abs(Number(data.balance))),
              ],
              [t('charged'), data.totalDebits],
              [t('credited'), data.totalCredits],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <bdi>{studentMoney(value ?? '0', locale)}</bdi>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
      <section className={styles.detailSection}>
        <h3>{t('installments')}</h3>
        {installments.isError ? (
          <ErrorNotice
            error={installments.error}
            copy={copy}
            retry={() => void installments.refetch()}
          />
        ) : installments.isPending ? (
          <p role="status">{copy.loading}</p>
        ) : installments.data.items.length ? (
          <AcademyTable
            label={t('installments')}
            rows={installments.data.items}
            busy={installments.isFetching}
            columns={[
              {
                id: 'ordinal',
                header: managementText(locale, 'installmentNumber'),
                cell: (row) => row.ordinal,
              },
              {
                id: 'due',
                header: t('due'),
                cell: (row) => formatAcademyDate(row.dueDate, locale, copy.none),
              },
              {
                id: 'original',
                header: t('amount'),
                cell: (row) => <bdi>{studentMoney(row.originalAmount, locale)}</bdi>,
              },
              {
                id: 'allocated',
                header: t('allocated'),
                cell: (row) => <bdi>{studentMoney(row.allocatedAmount, locale)}</bdi>,
              },
              {
                id: 'remaining',
                header: t('remaining'),
                cell: (row) => <bdi>{studentMoney(row.outstandingAmount, locale)}</bdi>,
              },
              {
                id: 'status',
                header: copy.status,
                cell: (row) => managementText(locale, row.state),
              },
              {
                id: 'actions',
                header: copy.actions,
                cell: (row) =>
                  row.payable && hasPermission(user, 'payments.checkout', ['S']) ? (
                    <StudentCheckout
                      key={row.id}
                      installmentId={row.id}
                      userId={user.id}
                      locale={locale}
                    />
                  ) : (
                    copy.none
                  ),
              },
            ]}
          />
        ) : (
          <p>{copy.empty}</p>
        )}
        <div className="mt-4 flex justify-between gap-2">
          <Button
            variant="secondary"
            disabled={!cursors.length || installments.isFetching}
            onClick={() => setCursors((old) => old.slice(0, -1))}
          >
            {copy.previous}
          </Button>
          <Button
            variant="secondary"
            disabled={!installments.data?.nextCursor || installments.isFetching}
            onClick={() => {
              const next = installments.data?.nextCursor;
              if (next) setCursors((old) => [...old, next]);
            }}
          >
            {copy.next}
          </Button>
        </div>
      </section>
    </>
  );
}
function StudentCheckout({
  installmentId,
  userId,
  locale,
}: {
  installmentId: string;
  userId: string;
  locale: Locale;
}) {
  const copy = getAcademyCopy(locale);
  const t = (key: Parameters<typeof studentText>[1]) => studentText(locale, key);
  const key = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const storageKey = `plg:student-checkout:${userId}:${installmentId}`;
  const checkout = useMutation({
    mutationFn: async () => {
      // Retain only an idempotency key, never a checkout secret, across a page reload.
      if (!key.current) {
        try {
          key.current = sessionStorage.getItem(storageKey) || undefined;
        } catch {
          /* Storage can be disabled. */
        }
        key.current ??= crypto.randomUUID();
        try {
          sessionStorage.setItem(storageKey, key.current);
        } catch {
          /* The in-memory key still protects retries. */
        }
      }
      try {
        return await createStudentCheckout(installmentId, key.current);
      } catch (error) {
        // Only a confirmed terminal attempt may be replaced. Unknown outcomes keep their key.
        if (
          error instanceof PlgApiError &&
          error.payload.code === 'PAYMOB_ATTEMPT_NOT_REPLAYABLE'
        ) {
          key.current = undefined;
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* Storage can be disabled. */
          }
        }
        throw error;
      }
    },
    retry: false,
    gcTime: 0,
  });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('pay')}
      </Button>
      {open ? (
        <Modal
          open
          onOpenChange={(value) => {
            if (!checkout.isPending) setOpen(value);
          }}
        >
          <ModalContent className={styles.modal} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <ModalHeader>
              <div>
                <ModalTitle>{t('pay')}</ModalTitle>
                <ModalDescription>{managementText(locale, 'checkoutHint')}</ModalDescription>
              </div>
              <ModalCloseButton aria-label={copy.close} disabled={checkout.isPending} />
            </ModalHeader>
            <ModalBody>
              {!checkout.data ? (
                <Button
                  variant="secondary"
                  disabled={checkout.isPending}
                  onClick={async () => {
                    if (busy.current) return;
                    busy.current = true;
                    try {
                      await checkout.mutateAsync();
                    } catch {
                      /* Error is displayed below. */
                    } finally {
                      busy.current = false;
                    }
                  }}
                >
                  {checkout.isPending ? copy.loading : t('pay')}
                </Button>
              ) : (
                <CheckoutResult
                  result={{ ...checkout.data }}
                  userId={userId}
                  locale={locale}
                  paymentPath="finance"
                />
              )}
              {checkout.isError ? <ErrorNotice error={checkout.error} copy={copy} /> : null}
            </ModalBody>
          </ModalContent>
        </Modal>
      ) : null}
    </>
  );
}
