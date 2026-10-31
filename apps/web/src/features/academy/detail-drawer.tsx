'use client';

import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@academyops/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft2, Maximize4 } from 'iconsax-react';
import { useEffect, useState } from 'react';
import { type AcademyRecord, type AcademyResource, records, textValue } from '@/api/academy/models';
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
import { isStepUpRequired, StepUpDialog } from './step-up-dialog';
export type DetailSelection = { resource: AcademyResource; row: AcademyRecord };
function BackIcon({ className }: { className?: string }) {
  return <ArrowLeft2 aria-hidden color="currentColor" className={className} />;
}

export function DetailDrawer({
  selection,
  user,
  locale,
  copy,
  canGoBack,
  onBack,
  onClose,
  onInspect,
  onAction,
  onExpandToPage,
}: {
  selection: DetailSelection;
  user: DashboardUser;
  locale: Locale;
  copy: AcademyCopy;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onInspect: (selection: DetailSelection) => void;
  onAction: (target: ActionTarget) => void;
  onExpandToPage?: () => void;
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
    <>
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open && !stepUpOpen) onClose();
        }}
      >
        <DrawerContent className={styles.drawer} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <DrawerHeader>
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-1.5">
                {canGoBack ? (
                  <Button
                    variant="ghost"
                    size="small"
                    iconOnly
                    leadingIcon={BackIcon}
                    aria-label={copy.previous}
                    title={copy.previous}
                    className="-ms-1.5 shrink-0 [&_svg]:rtl:rotate-180"
                    onClick={onBack}
                    type="button"
                  />
                ) : null}
                <DrawerDescription className="text-xs text-text-secondary">
                  {copy.academy} / {academyLabel(copy, resource)}
                </DrawerDescription>
              </div>
              <div className={styles.detailHeading}>
                <RecordAvatar row={detail ?? row} resource={resource} />
                <div>
                  <DrawerTitle className={styles.drawerTitle}>{title}</DrawerTitle>
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
            <div className="flex items-center gap-2">
              {onExpandToPage ? (
                <button
                  type="button"
                  onClick={onExpandToPage}
                  title={workflowText(locale, 'openFullPage')}
                  aria-label={workflowText(locale, 'openFullPage')}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-secondary bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:bg-background-secondary-default hover:text-text-primary transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  <Maximize4 aria-hidden size={16} color="currentColor" />
                </button>
              ) : null}
              <DrawerCloseButton aria-label={copy.close} />
            </div>
          </DrawerHeader>
          <DrawerBody>
            {query.isError ? (
              <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
            ) : query.isPending ? (
              <p className="p-4 text-sm" role="status">
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
          </DrawerBody>
        </DrawerContent>
      </Drawer>
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
    </>
  );
}
