'use client';

import { records, textValue } from '@/api/academy/models';
import { managementRow } from '@/api/management/queries';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-detail-styles';

import { financialRequestActions } from './action-access';

import { ManagementFacts } from './presentation';
import type { useManagementDetailState } from './use-management-detail-state';
export function PaymentApprovalRequests({
  model,
}: {
  model: ReturnType<typeof useManagementDetailState>;
}) {
  const { resource, user, locale, onAction, t, detail } = model;
  if (!detail) return null;
  return (
    <>
      {resource === 'payments' && records(detail.data.pendingApprovals).length ? (
        <section className={styles.detailSection}>
          <h3>{t('pendingApprovals')}</h3>
          <div className="grid gap-3">
            {records(detail.data.pendingApprovals).map((request) => {
              const requestRow = managementRow('payments', {
                ...request,
                externalReference: detail.name,
                paymentId: detail.id,
              });
              const own = request.requestedBy === user.id;
              return (
                <div
                  key={textValue(request.id)}
                  className="rounded-xl border border-border bg-surface-subtle p-4"
                >
                  <p className="mb-3 text-sm font-semibold text-ink">
                    {t(request.kind === 'REFUND' ? 'requestRefund' : 'requestReversal')}
                  </p>
                  <ManagementFacts
                    data={request}
                    names={['requestedAmount', 'reason', 'createdAt']}
                    locale={locale}
                  />
                  {own ? <p className="mt-3 text-xs text-ink-muted">{t('makerChecker')}</p> : null}
                  {financialRequestActions(user, requestRow, detail.status).map((action) => (
                    <Button
                      key={action}
                      className="me-2 mt-3"
                      variant="secondary"
                      onClick={() =>
                        onAction({
                          action,
                          resource: 'payments',
                          row: requestRow,
                        })
                      }
                    >
                      {t(action)}
                    </Button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
