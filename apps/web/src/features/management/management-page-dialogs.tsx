'use client';

import { StepUpDialog } from '@/features/academy/step-up-dialog';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import { ManagementActionDialog } from './action-dialog';
import { ManagementDetail } from './detail-drawer';
import type { useManagementPageState } from './use-management-page-state';

export function ManagementPageDialogs({
  model,
}: {
  model: ReturnType<typeof useManagementPageState>;
}) {
  const {
    resource,
    selection,
    setSelection,
    recordId,
    updateParams,
    sessionId,
    target,
    setTarget,
    user,
    locale,
    copy,
    stepUp,
    setStepUp,
    list,
    params,
  } = model;

  const isFullPage = params.get('mode') === 'page';

  return (
    <>
      {selection && !isFullPage ? (
        <ManagementDetail
          key={`${resource}-${selection.id}`}
          resource={resource}
          row={list.data?.items.find((item) => item.id === selection.id) ?? selection}
          user={user}
          locale={locale}
          onClose={() => {
            setSelection(undefined);
            if (recordId) updateParams({ record: undefined });
          }}
          onAction={(actionTarget) =>
            setTarget({ ...actionTarget, ...(sessionId ? { sessionId } : {}) })
          }
          onExpandToPage={() => updateParams({ record: selection.id, mode: 'page' })}
        />
      ) : null}
      {target ? (
        <ManagementActionDialog
          key={`${target.action}-${target.row?.id ?? 'new'}`}
          target={target}
          userId={user.id}
          canReadBusinessAccount={hasPermission(user, 'business_accounts.read')}
          locale={locale}
          onClose={() => setTarget(undefined)}
        />
      ) : null}
      {stepUp ? (
        <StepUpDialog
          open
          locale={locale}
          copy={copy}
          onClose={() => setStepUp(false)}
          onVerified={async () => {
            setStepUp(false);
            await list.refetch();
          }}
        />
      ) : null}
    </>
  );
}
