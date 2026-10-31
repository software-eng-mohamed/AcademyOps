'use client';

import { Badge } from '@academyops/ui/registry';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type FeeTarget, listFees, pricingKey, readFee } from '@/api/academy/pricing';
import { Button } from '@/components/base/buttons/button';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission, hasStaffPermission } from '@/features/dashboard/navigation';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { pricingText } from '@/i18n/pricing-copy';
import type { Locale } from '@/lib/locales';
import styles from './academy-detail-styles';
import { AcademyTable } from './academy-table';
import { ErrorNotice, formatAcademyDate } from './academy-ui';
import { PricingDialog } from './pricing-dialog';
import { isStepUpRequired, StepUpDialog } from './step-up-dialog';

export function EnrollmentPricing({
  enrollmentId,
  state,
  user,
  locale,
}: {
  enrollmentId: string;
  state: string;
  user: DashboardUser;
  locale: Locale;
}) {
  const [selected, setSelected] = useState('');
  const [target, setTarget] = useState<FeeTarget>();
  const [stepUp, setStepUp] = useState(false);
  const t = (key: string) => pricingText(locale, key);
  const copy = getAcademyCopy(locale);
  const key = pricingKey(user.id, enrollmentId);
  const list = useInfiniteQuery({
    queryKey: [...key, 'list'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => listFees(enrollmentId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: [...key, 'detail', selected],
    queryFn: ({ signal }) => readFee(selected, signal),
    enabled: Boolean(selected),
  });
  const error = list.error || detail.error;
  useEffect(() => {
    if (isStepUpRequired(error)) setStepUp(true);
  }, [error]);
  const agreement = detail.data;
  const canPropose = hasStaffPermission(user, 'pricing.propose');
  const canCreate = canPropose && ['DRAFT', 'PENDING_APPROVAL'].includes(state);
  const canApprove =
    hasPermission(user, 'discounts.approve_tier1', ['O']) &&
    (agreement?.requiredApprovalTier !== 2 ||
      hasPermission(user, 'discounts.approve_tier2', ['O']));
  const action = (name: FeeTarget['action']) => (
    <Button
      key={name}
      variant="secondary"
      size="small"
      onClick={() => setTarget({ action: name, ...(agreement ? { agreement } : {}) })}
    >
      {t(name)}
    </Button>
  );
  return (
    <section className={styles.detailSection}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3>{t('title')}</h3>
        {canCreate ? action('create') : null}
      </div>
      <p className="text-sm leading-relaxed text-ink-muted">
        {t(
          !canPropose
            ? 'readOnly'
            : !canCreate
              ? 'locked'
              : hasPermission(user, 'discounts.approve_tier1', ['O'])
                ? 'hint'
                : 'proposalHint',
        )}
      </p>
      {error ? (
        <ErrorNotice
          error={error}
          copy={copy}
          retry={() => {
            void list.refetch();
            if (selected) void detail.refetch();
          }}
        />
      ) : null}
      {list.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : !list.isError && !list.data?.pages.some((page) => page.items.length) ? (
        <p className="text-sm text-ink-muted">{t('empty')}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2.5">
        {list.data?.pages
          .flatMap((page) => page.items)
          .map((item) => (
            <Button
              key={item.id}
              size="small"
              variant={selected === item.id ? 'primary' : 'secondary'}
              aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
            >
              {t('version')} {item.version} · {t(item.status)}
            </Button>
          ))}
        {list.hasNextPage ? (
          <Button
            variant="ghost"
            size="small"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t('next')}
          </Button>
        ) : null}
      </div>
      {selected && detail.isPending ? <p role="status">{copy.loading}</p> : null}
      {agreement ? (
        <div className="grid min-w-0 gap-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            {(['subtotal', 'discountAmount', 'totalAmount'] as const).map((name) => (
              <div key={name}>
                <dt className="text-xs text-ink-muted">
                  {name === 'subtotal'
                    ? t('lines')
                    : t(name === 'discountAmount' ? 'discount' : 'total')}
                </dt>
                <dd className="mt-1 font-semibold text-ink">
                  <bdi>
                    {agreement[name]} {agreement.currencyCode}
                  </bdi>
                </dd>
              </div>
            ))}
          </dl>
          <AcademyTable
            rows={agreement.lines}
            label={t('lines')}
            busy={detail.isFetching}
            columns={[
              {
                id: 'name',
                header: t('lines'),
                cell: (line) => (locale === 'ar' ? line.descriptionAr : line.descriptionEn),
              },
              { id: 'quantity', header: t('quantity'), cell: (line) => <bdi>{line.quantity}</bdi> },
              { id: 'amount', header: t('amount'), cell: (line) => <bdi>{line.lineAmount}</bdi> },
            ]}
          />
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            {agreement.status === 'DRAFT' && canPropose ? (
              <>
                {action('edit')}
                {action('submit')}
              </>
            ) : null}
            {agreement.status === 'PROPOSED' ? (
              <>
                {canApprove ? action('approve') : null}
                {hasPermission(user, 'discounts.approve_tier1', ['O']) ? action('reject') : null}
              </>
            ) : null}
            {agreement.status === 'APPROVED' && canPropose ? action('createSchedule') : null}
          </div>
          {agreement.schedules.map((schedule) => (
            <section key={schedule.id} className="grid min-w-0 gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">
                  {t('schedule')} {schedule.version}
                </h4>
                <Badge variant="outline">{t(schedule.status)}</Badge>
              </div>
              <AcademyTable
                rows={schedule.installments}
                label={`${t('schedule')} ${schedule.version}`}
                busy={false}
                columns={[
                  {
                    id: 'name',
                    header: t('dueDate'),
                    cell: (item) => formatAcademyDate(item.dueDate, locale, '—'),
                  },
                  { id: 'amount', header: t('amount'), cell: (item) => <bdi>{item.amount}</bdi> },
                ]}
              />
              {schedule.status === 'DRAFT' && agreement.status === 'APPROVED' ? (
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {canPropose ? (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setTarget({ action: 'editSchedule', agreement, schedule })}
                    >
                      {t('editSchedule')}
                    </Button>
                  ) : null}
                  {hasPermission(user, 'discounts.approve_tier1', ['O']) ? (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setTarget({ action: 'approveSchedule', agreement, schedule })}
                    >
                      {t('approveSchedule')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
      {target ? (
        <PricingDialog
          target={target}
          enrollmentId={enrollmentId}
          userId={user.id}
          locale={locale}
          onClose={() => setTarget(undefined)}
          onCreated={setSelected}
        />
      ) : null}
      <StepUpDialog
        open={stepUp}
        locale={locale}
        copy={copy}
        onClose={() => setStepUp(false)}
        onVerified={() => {
          setStepUp(false);
          void list.refetch();
          if (selected) void detail.refetch();
        }}
      />
    </section>
  );
}
