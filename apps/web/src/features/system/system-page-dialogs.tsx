'use client';
import { record } from '@/api/academy/models';
import { StepUpDialog } from '@/features/academy/step-up-dialog';
import { AccessDialog } from './access-dialog';
import { ImportUpload } from './import-controls';
import { SystemDetail } from './system-detail';
import type { useSystemPageState } from './use-system-page-state';

type Model = Extract<ReturnType<typeof useSystemPageState>, { denied: false }>;
export function SystemPageDialogs({ model }: { model: Model }) {
  const {
    user,
    locale,
    copy,
    params,
    resource,
    action,
    setAction,
    upload,
    setUpload,
    stepUp,
    setStepUp,
    update,
    list,
  } = model;
  return (
    <>
      {' '}
      {params.get('detail') ? (
        <SystemDetail
          key={`${resource}-${params.get('detail')}`}
          id={params.get('detail') as string}
          resource={resource}
          user={user}
          locale={locale}
          onClose={() => update({ detail: undefined })}
        />
      ) : null}
      {action ? (
        <AccessDialog
          action={action}
          user={user}
          locale={locale}
          onClose={() => setAction(undefined)}
        />
      ) : null}
      {upload ? (
        <ImportUpload
          userId={user.id}
          locale={locale}
          onClose={() => setUpload(false)}
          onSaved={(value) => {
            if (typeof record(value).id === 'string') update({ detail: String(record(value).id) });
          }}
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
        }}
      />
    </>
  );
}
