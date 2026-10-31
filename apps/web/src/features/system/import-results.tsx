'use client';

import { record, records, textValue } from '@/api/academy/models';
import { AcademyTable } from '@/features/academy/academy-table';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';
import type { SystemRecord } from './config';
import { SystemValue } from './system-ui';

export function ImportSources({ value, locale }: { value: unknown; locale: Locale }) {
  const t = (key: string) => systemText(locale, key);
  return (
    <div className="grid min-w-0 gap-4">
      {records(value).map((source, index) => {
        const sheets = records(record(source.workbookMeta).sheets).map((sheet, i) => ({
          name: textValue(sheet.name),
          rowCount: sheet.rowCount,
          id: String(i),
          visibility: sheet.state,
        }));
        return (
          <section key={textValue(source.id) || index} className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <bdi className="font-semibold text-ink [overflow-wrap:anywhere]">
                {textValue(source.originalName)}
              </bdi>
              <span className="text-ink-muted">
                {new Intl.NumberFormat(locale).format(Number(source.sizeBytes) || 0)} {t('bytes')}
              </span>
            </div>
            <AcademyTable
              rows={sheets}
              busy={false}
              label={`${t('worksheets')}: ${textValue(source.originalName)}`}
              columns={[
                { id: 'name', header: t('sheetName'), cell: (row) => textValue(row.name) },
                {
                  id: 'visibility',
                  header: t('visibility'),
                  cell: (row) => t(textValue(row.visibility)),
                },
                { id: 'rowCount', header: t('rowCount'), cell: (row) => String(row.rowCount ?? 0) },
              ]}
            />
          </section>
        );
      })}
    </div>
  );
}

export function ImportReconciliation({ value, locale }: { value: unknown; locale: Locale }) {
  const t = (key: string) => systemText(locale, key);
  const rows: SystemRecord[] = records(value).map((row, index) => ({
    ...row,
    id: textValue(row.id) || String(index),
  }));
  if (!rows.length) return <p className="text-sm text-ink-muted">{t('reconciliationPending')}</p>;
  return (
    <AcademyTable<SystemRecord>
      rows={rows}
      busy={false}
      label={t('reconciliation')}
      columns={['metric', 'sourceValue', 'targetValue', 'difference', 'passed'].map((key) => ({
        id: key === 'metric' ? 'name' : key,
        header: t(key),
        cell: (row) => <SystemValue value={row[key]} locale={locale} />,
      }))}
    />
  );
}
