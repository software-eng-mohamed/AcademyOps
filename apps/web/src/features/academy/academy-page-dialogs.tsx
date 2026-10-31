'use client';

import { academyKey } from '@/api/academy/queries';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import { ActionDialog } from './action-dialog';
import { DetailDrawer } from './detail-drawer';
import { StepUpDialog } from './step-up-dialog';

import type { AcademyPageModel } from './use-academy-page';

export function AcademyPageDialogs({ model }: { model: AcademyPageModel }) {
  const {
    user,
    locale,
    copy,
    queryClient,
    selection,
    setSelection,
    target,
    setTarget,
    stepUpOpen,
    setStepUpOpen,
    branchId,
    updateParams,
    selectedId,
    saved,
    activeSelection,
  } = model;
  return (
    <>
      {activeSelection && model.params.get('mode') !== 'page' ? (
        <DetailDrawer
          selection={activeSelection}
          user={user}
          locale={locale}
          copy={copy}
          canGoBack={selection.length > 1}
          onBack={() => setSelection((old) => old.slice(0, -1))}
          onClose={() => {
            setSelection([]);
            if (selectedId) updateParams({ record: undefined });
          }}
          onInspect={(item) => setSelection((old) => [...old, item])}
          onAction={setTarget}
          onExpandToPage={() => updateParams({ record: activeSelection.row.id, mode: 'page' })}
        />
      ) : null}
      {target ? (
        <ActionDialog
          target={target}
          userId={user.id}
          canEditSensitive={hasPermission(user, 'students.update_sensitive')}
          {...(branchId ? { branchId } : {})}
          locale={locale}
          copy={copy}
          onClose={() => setTarget(undefined)}
          onSaved={saved}
        />
      ) : null}
      <StepUpDialog
        open={stepUpOpen}
        locale={locale}
        copy={copy}
        onClose={() => setStepUpOpen(false)}
        onVerified={async () => {
          setStepUpOpen(false);
          await queryClient.invalidateQueries({ queryKey: academyKey(user.id) });
        }}
      />
    </>
  );
}
