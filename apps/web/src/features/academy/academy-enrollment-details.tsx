'use client';

import { normalizeRecord, record, records, textValue } from '@/api/academy/models';
import { Button } from '@/components/base/buttons/button';
import { hasStaffPermission as hasPermission, staffScopes } from '@/features/dashboard/navigation';
import { EnrollmentAttendanceSummary } from '@/features/management/attendance-record';
import { academyLabel } from '@/i18n/academy-copy';
import { workflowText } from '@/i18n/workflow-copy';
import type { AcademyDetailModel } from './academy-detail-model';
import styles from './academy-detail-styles';
import { StatusPill } from './academy-ui';
import { EnrollmentPricing } from './enrollment-pricing';

export function AcademyEnrollmentDetails({ model }: { model: AcademyDetailModel }) {
  const { detail, resource, user, locale, copy, onAction } = model;
  return (
    <>
      {resource === 'enrollments' && typeof record(detail.data.finance).balance === 'string'
        ? (() => {
            const balanceNum = Number(record(detail.data.finance).balance);
            const isPaid = Number.isFinite(balanceNum) && balanceNum <= 0;
            return (
              <section className={styles.detailSection}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3>{copy.balance}</h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      isPaid
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {isPaid
                      ? workflowText(locale, 'fullyPaidTitle')
                      : workflowText(locale, 'remainingBalanceTitle').replace(
                          '{amount}',
                          textValue(record(detail.data.finance).balance),
                        )}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ink" dir="ltr">
                  {textValue(record(detail.data.finance).currencyCode)}{' '}
                  {textValue(record(detail.data.finance).balance)}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {isPaid
                    ? workflowText(locale, 'fullyPaidDesc')
                    : workflowText(locale, 'remainingBalanceDesc')}
                </p>
              </section>
            );
          })()
        : null}
      {resource === 'enrollments' ? (
        hasPermission(user, 'attendance.read', staffScopes(user)) ? (
          <EnrollmentAttendanceSummary
            key={`attendance-${detail.id}`}
            enrollmentId={detail.id}
            userId={user.id}
            locale={locale}
          />
        ) : null
      ) : null}
      {resource === 'enrollments' ? (
        hasPermission(user, 'pricing.read', staffScopes(user)) ? (
          <EnrollmentPricing
            key={`pricing-${detail.id}`}
            enrollmentId={detail.id}
            state={textValue(detail.data.state)}
            user={user}
            locale={locale}
          />
        ) : null
      ) : null}
      {resource === 'enrollments' ? (
        <section className={styles.detailSection}>
          <h3>{copy.retakes}</h3>
          <div className={styles.related}>
            {records(detail.data.retakes).length ? (
              records(detail.data.retakes).map((item) => (
                <div className={styles.relatedItem} key={textValue(item.id)}>
                  <div>
                    <StatusPill status={textValue(item.status)} copy={copy} />
                    <p className="mt-2 text-sm">{textValue(item.reason)}</p>
                  </div>
                  {item.status === 'REQUESTED' && hasPermission(user, 'enrollments.retake') ? (
                    <div className={styles.inlineActions}>
                      {(['approveRetake', 'rejectRetake'] as const).map((action) => (
                        <Button
                          key={action}
                          variant="secondary"
                          type="button"
                          size="small"
                          onClick={() =>
                            onAction({
                              resource,
                              action,
                              row: normalizeRecord('enrollments', item),
                            })
                          }
                        >
                          {academyLabel(copy, action)}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className={styles.muted}>{copy.empty}</p>
            )}
          </div>
        </section>
      ) : null}
      {resource === 'enrollments' && records(detail.data.cancellationRequests).length ? (
        <section className={styles.detailSection}>
          <h3>{copy.cancellationRequests}</h3>
          <div className={styles.related}>
            {records(detail.data.cancellationRequests).map((item) => (
              <div className={styles.relatedItem} key={textValue(item.id)}>
                <div>
                  <StatusPill status={textValue(item.status)} copy={copy} />
                  <p className="mt-2 text-sm">{textValue(item.reason)}</p>
                </div>
                {item.status === 'REQUESTED' &&
                hasPermission(user, 'enrollments.cancel.approve') ? (
                  item.requestedBy === user.id ? (
                    <p className={styles.muted}>{copy.makerChecker}</p>
                  ) : (
                    <div className={styles.inlineActions}>
                      {(['approveCancellation', 'rejectCancellation'] as const).map((action) => (
                        <Button
                          key={action}
                          type="button"
                          size="small"
                          variant="secondary"
                          onClick={() =>
                            onAction({
                              resource,
                              action,
                              row: normalizeRecord('enrollments', item),
                            })
                          }
                        >
                          {academyLabel(copy, action)}
                        </Button>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
