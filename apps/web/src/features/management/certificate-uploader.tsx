'use client';

import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-detail-styles';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import type { useManagementDetailState } from './use-management-detail-state';

export function CertificateUploader({
  model,
}: {
  model: ReturnType<typeof useManagementDetailState>;
}) {
  const { resource, detail, user, file, setFile, upload, copy, t } = model;
  if (
    resource !== 'certificates' ||
    detail?.status !== 'ISSUED' ||
    !hasPermission(user, 'certificates.upload')
  )
    return null;

  return (
    <section className={styles.detailSection}>
      <h3>{t('uploadCertificate')}</h3>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (file && !upload.isPending) upload.mutate();
        }}
      >
        <label className="grid min-w-0 flex-1 gap-2 text-sm text-ink-muted">
          {t('pdfOnly')}
          <input
            aria-label={t('uploadCertificate')}
            type="file"
            accept="application/pdf,.pdf"
            disabled={upload.isPending}
            className="w-full rounded-lg border border-border p-2 text-sm file:me-3 file:rounded-md file:bg-brand-soft file:px-3 file:py-1 file:text-brand"
            onChange={(event) => {
              setFile(event.target.files?.[0]);
              upload.reset();
            }}
          />
        </label>
        <Button type="submit" disabled={!file || upload.isPending}>
          {upload.isPending ? copy.loading : t('upload')}
        </Button>
      </form>
      {upload.isError ? (
        ['invalidPdf', 'versionRequired'].includes(upload.error.message) ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {t(upload.error.message)}
          </p>
        ) : (
          <ErrorNotice error={upload.error} copy={copy} />
        )
      ) : null}
      {upload.isSuccess ? (
        <p role="status" className="mt-2 text-sm text-success">
          {t('saved')}
        </p>
      ) : null}
    </section>
  );
}
