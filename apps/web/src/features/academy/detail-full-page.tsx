'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft2, SidebarRight } from 'iconsax-react';
import { useEffect, useState } from 'react';
import { records, textValue } from '@/api/academy/models';
import { academyKey, getAcademyDetail } from '@/api/academy/queries';
import { Button } from '@/components/base/buttons/button';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import { type AcademyCopy, academyLabel } from '@/i18n/academy-copy';
import { workflowText } from '@/i18n/workflow-copy';
import type { Locale } from '@/lib/locales';
import { AcademyDetailHistory } from './academy-detail-history';
import { AcademyDetailRelations } from './academy-detail-relations';
import styles from './academy-detail-styles';
import { AcademyDetailSummary } from './academy-detail-summary';
import { AcademyEnrollmentDetails } from './academy-enrollment-details';
import { RecordAvatar } from './academy-records';
import { ErrorNotice, StatusPill } from './academy-ui';
import { type ActionTarget, actionPermission, recordActions } from './actions';
import { CohortStatus } from './cohort-intake';
import type { DetailSelection } from './detail-drawer';
import { isStepUpRequired, StepUpDialog } from './step-up-dialog';

export function DetailFullPage({
  selection,
  user,
  locale,
  copy,
  canGoBack,
  onBack,
  onSwitchToDrawer,
  onInspect,
  onAction,
}: {
  selection: DetailSelection;
  user: DashboardUser;
  locale: Locale;
  copy: AcademyCopy;
  canGoBack: boolean;
  onBack: () => void;
  onSwitchToDrawer: () => void;
  onInspect: (selection: DetailSelection) => void;
  onAction: (target: ActionTarget) => void;
}) {
  const { resource, row } = selection;
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const query = useQuery({
    queryKey: [...academyKey(user.id), 'detail', resource, row.id],
    queryFn: ({ signal }) => getAcademyDetail(resource, row, signal),
    staleTime: 0,
  });
  const detail = query.data;
  const actions = detail
    ? recordActions(resource, detail).filter((action) =>
        hasPermission(
          user,
          actionPermission(resource, action),
          resource === 'stages' ? ['O'] : undefined,
        ),
      )
    : [];
  const title =
    resource === 'versions'
      ? copy.versionLabel.replace('{version}', textValue(detail?.data.version ?? row.data.version))
      : detail?.name || row.name || academyLabel(copy, resource);
  const allEvents = detail
    ? [...records(detail.data.history), ...records(detail.data.events)].sort((a, b) =>
        textValue(b.occurredAt).localeCompare(textValue(a.occurredAt)),
      )
    : [];

  useEffect(() => {
    if (isStepUpRequired(query.error)) setStepUpOpen(true);
  }, [query.error]);

  return (
    <article className={styles.fullPage} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className={styles.fullPageHeader}>
        <div className={styles.fullPageNav}>
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={onBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft2 aria-hidden color="currentColor" className="size-4 rtl:rotate-180" />
            <span>{canGoBack ? copy.previous : workflowText(locale, 'backToList')}</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={onSwitchToDrawer}
            className="flex items-center gap-2"
            title={workflowText(locale, 'openDrawer')}
          >
            <SidebarRight aria-hidden size={16} color="currentColor" />
            <span>{workflowText(locale, 'openDrawer')}</span>
          </Button>
        </div>
        <div className={styles.fullPageHeading}>
          <div className={styles.fullPageIdentity}>
            <RecordAvatar row={detail ?? row} resource={resource} />
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">
                {copy.academy} / {academyLabel(copy, resource)}
              </p>
              <h1 className={styles.fullPageTitle}>{title}</h1>
              {detail?.status || row.status ? (
                <div className="mt-2">
                  {resource === 'cohorts' ? (
                    <CohortStatus row={detail ?? row} copy={copy} />
                  ) : (
                    <StatusPill status={detail?.status ?? row.status} copy={copy} />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <div className="space-y-6">
        {query.isError ? (
          <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
        ) : query.isPending ? (
          <p className="p-8 text-center text-sm text-text-secondary" role="status">
            {copy.loading}
          </p>
        ) : detail ? (
          <>
            <AcademyDetailSummary
              model={{
                detail,
                resource,
                user,
                locale,
                copy,
                actions,
                allEvents,
                onInspect,
                onAction,
              }}
            />
            <AcademyDetailRelations
              model={{
                detail,
                resource,
                user,
                locale,
                copy,
                actions,
                allEvents,
                onInspect,
                onAction,
              }}
            />
            <AcademyEnrollmentDetails
              model={{
                detail,
                resource,
                user,
                locale,
                copy,
                actions,
                allEvents,
                onInspect,
                onAction,
              }}
            />
            <AcademyDetailHistory
              model={{
                detail,
                resource,
                user,
                locale,
                copy,
                actions,
                allEvents,
                onInspect,
                onAction,
              }}
            />
          </>
        ) : null}
      </div>
      <StepUpDialog
        open={stepUpOpen}
        locale={locale}
        copy={copy}
        onClose={() => setStepUpOpen(false)}
        onVerified={async () => {
          setStepUpOpen(false);
          await query.refetch();
        }}
      />
    </article>
  );
}
