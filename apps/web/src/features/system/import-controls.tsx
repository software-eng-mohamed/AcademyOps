'use client';

import { Field, Textarea } from '@academyops/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { record } from '@/api/academy/models';
import {
  executeImportAction,
  type ImportAction,
  importActions,
  stageWorkbook,
  validWorkbook,
} from '@/api/system/commands';
import { getImportIssues, systemKey } from '@/api/system/queries';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-styles';
import { ErrorNotice } from '@/features/academy/academy-ui';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission } from '@/features/dashboard/navigation';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';
import { SystemCommandDialog } from './command-dialog';
import type { SystemRecord } from './config';
import { ResolveIssueDialog } from './import-resolution-dialog';
import { ImportReconciliation, ImportSources } from './import-results';
import { StructuredValues, SystemSelect, SystemStatus } from './system-ui';
export function ImportUpload({
  userId,
  locale,
  onClose,
  onSaved,
}: {
  userId: string;
  locale: Locale;
  onClose: () => void;
  onSaved: (result: unknown) => void;
}) {
  const [file, setFile] = useState<File>();
  const [invalid, setInvalid] = useState(false);
  const id = useId();
  const t = (key: string) => systemText(locale, key);
  return (
    <SystemCommandDialog
      title={t('stage')}
      description={t('importHint')}
      userId={userId}
      locale={locale}
      fingerprint={`${file?.name}-${file?.size}-${file?.lastModified}`}
      submit={() => {
        if (!file) throw new Error('File required');
        return stageWorkbook(file);
      }}
      validate={() => {
        const valid = Boolean(file && validWorkbook(file));
        setInvalid(!valid);
        return valid;
      }}
      onClose={onClose}
      onSaved={onSaved}
    >
      <Field htmlFor={id} label={t('workbook')} error={invalid ? t('fileInvalid') : undefined}>
        <input
          id={id}
          className="w-full rounded-xl border border-border bg-surface-subtle p-4 text-sm file:me-3 file:rounded-md file:border-0 file:bg-brand-soft file:p-2 file:text-brand"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setFile(event.target.files?.[0]);
            setInvalid(false);
          }}
        />
      </Field>
    </SystemCommandDialog>
  );
}

export function ImportActionDialog({
  action,
  item,
  userId,
  locale,
  onClose,
}: {
  action: ImportAction;
  item: SystemRecord;
  userId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const id = useId();
  const t = (key: string) => systemText(locale, key);
  return (
    <SystemCommandDialog
      title={t(action)}
      description={t('importWarning')}
      locale={locale}
      userId={userId}
      fingerprint={JSON.stringify({ action, id: item.id, note })}
      submit={(key) => executeImportAction(action, item.id, key, note)}
      validate={() =>
        action !== 'archive' || (note.trim().length >= 10 && note.trim().length <= 1000)
      }
      onClose={onClose}
    >
      {action === 'archive' ? (
        <Field htmlFor={id} label={t('note')}>
          <Textarea
            id={id}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required
            minLength={10}
            maxLength={1000}
          />
        </Field>
      ) : (
        <StructuredValues
          value={{
            status: item.status,
            openIssues: item.openIssues,
            dispositions: item.dispositions,
          }}
          locale={locale}
        />
      )}
    </SystemCommandDialog>
  );
}

export function ImportDetail({
  item,
  user,
  locale,
}: {
  item: SystemRecord;
  user: DashboardUser;
  locale: Locale;
}) {
  const [action, setAction] = useState<ImportAction>();
  const [issue, setIssue] = useState<SystemRecord>();
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | 'IGNORED'>('OPEN');
  const t = (key: string) => systemText(locale, key);
  const copy = getAcademyCopy(locale);
  const issues = useInfiniteQuery({
    queryKey: [...systemKey(user.id), 'issues', item.id, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getImportIssues(item.id, status, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const actions = importActions(item).filter((entry) =>
    hasPermission(
      user,
      ['validate', 'reconcile'].includes(entry) ? 'imports.preview' : 'imports.finalize',
      ['O'],
    ),
  );
  return (
    <>
      <div className={styles.detailSection}>
        <p className="mb-4 text-sm leading-relaxed text-ink-muted">{t('importHint')}</p>
        <div className="flex flex-wrap gap-2">
          {actions.map((entry) => (
            <Button key={entry} variant="secondary" onClick={() => setAction(entry)}>
              {t(entry)}
            </Button>
          ))}
        </div>
      </div>
      {['sources', 'dispositions', 'reconciliation'].map((key) => (
        <section key={key} className={styles.detailSection}>
          <h3>{t(key)}</h3>
          {key === 'sources' ? (
            <ImportSources value={item.sources} locale={locale} />
          ) : key === 'reconciliation' ? (
            <ImportReconciliation value={item.reconciliation} locale={locale} />
          ) : (
            <StructuredValues value={item[key]} locale={locale} />
          )}
        </section>
      ))}
      <section className={styles.detailSection}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h3>{t('issues')}</h3>
          <SystemSelect
            label={t('status')}
            value={status}
            options={['OPEN', 'RESOLVED', 'IGNORED']}
            onChange={(value) => setStatus(value as typeof status)}
            locale={locale}
          />
        </div>
        {issues.isPending ? (
          <p role="status">{copy.loading}</p>
        ) : issues.isError ? (
          <ErrorNotice error={issues.error} copy={copy} retry={() => void issues.refetch()} />
        ) : (
          <div className="grid gap-3">
            {issues.data?.pages
              .flatMap((page) => page.items)
              .map((entry) => (
                <div key={entry.id} className="min-w-0 rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <bdi className="text-sm font-semibold [overflow-wrap:anywhere]">
                      {String(entry.code)}
                    </bdi>
                    <SystemStatus value={entry.status} locale={locale} />
                  </div>
                  <div className="mt-3">
                    <StructuredValues
                      value={{
                        severity: entry.severity,
                        sheetName: record(entry.row).sheetName,
                        rowNumber: record(entry.row).rowNumber,
                        details: entry.details,
                      }}
                      locale={locale}
                    />
                  </div>
                  {entry.row &&
                  entry.status === 'OPEN' &&
                  item.status !== 'FINALIZED' &&
                  hasPermission(user, 'imports.finalize', ['O']) ? (
                    <Button variant="secondary" className="mt-3" onClick={() => setIssue(entry)}>
                      {t('resolve')}
                    </Button>
                  ) : null}
                </div>
              ))}
            {!issues.data?.pages[0]?.items.length ? (
              <p className="text-sm text-ink-muted">{copy.noResults}</p>
            ) : null}
            {issues.hasNextPage ? (
              <Button
                variant="ghost"
                disabled={issues.isFetchingNextPage}
                onClick={() => void issues.fetchNextPage()}
              >
                {t('loadMore')}
              </Button>
            ) : null}
          </div>
        )}
      </section>
      {action ? (
        <ImportActionDialog
          action={action}
          item={item}
          userId={user.id}
          locale={locale}
          onClose={() => setAction(undefined)}
        />
      ) : null}
      {issue ? (
        <ResolveIssueDialog
          batchId={item.id}
          issue={issue}
          userId={user.id}
          locale={locale}
          onClose={() => setIssue(undefined)}
        />
      ) : null}
    </>
  );
}
