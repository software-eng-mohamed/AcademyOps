'use client';

import { useId } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { managementText } from '@/i18n/management-copy';
import type { Locale } from '@/lib/locales';
import type { FormValues } from './actions';
import { type InvoiceLine, invoiceLines, newInvoiceLine } from './invoice-values';
import { ManagementLookup } from './lookup-select';

export function InvoiceLinesEditor({
  values,
  onChange,
  userId,
  locale,
  error,
}: {
  values: FormValues;
  onChange: (value: string) => void;
  userId: string;
  locale: Locale;
  error?: string;
}) {
  const id = useId();
  const lines = invoiceLines(values.invoiceLines);
  const t = (key: string) => managementText(locale, key);
  const update = (index: number, changes: Partial<InvoiceLine>) =>
    onChange(
      JSON.stringify(lines.map((line, i) => (i === index ? { ...line, ...changes } : line))),
    );
  return (
    <fieldset className="grid min-w-0 gap-4">
      <legend className="mb-3 text-sm font-semibold text-ink">{t('lines')}</legend>
      {lines.map((line, index) => (
        <div
          key={line.key}
          className="grid min-w-0 gap-4 rounded-xl border border-border bg-surface-subtle p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {t('invoiceLine')} {(index + 1).toLocaleString(locale)}
            </h3>
            <Button
              size="small"
              variant="ghost"
              disabled={lines.length === 1}
              onClick={() => onChange(JSON.stringify(lines.filter((_, i) => i !== index)))}
              aria-label={`${t('removeLine')} ${index + 1}`}
            >
              {t('removeLine')}
            </Button>
          </div>
          <ManagementLookup
            name="ledgerEntryId"
            controlId={`${id}-${line.key}-entry`}
            kind="ledgerEntries"
            values={{ ...values, ledgerEntryId: line.ledgerEntryId }}
            onChange={(ledgerEntryId) => update(index, { ledgerEntryId })}
            userId={userId}
            locale={locale}
            required
          />
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label={t('description')}
                value={line.descriptionEn || line.descriptionAr}
                isRequired
                onChange={(value) => update(index, { descriptionEn: value, descriptionAr: value })}
                inputMode="text"
              />
            </div>
            {(['quantity', 'unitAmount', 'taxAmount'] as const).map((name) => (
              <Input
                key={name}
                label={t(name)}
                value={line[name]}
                isRequired={name !== 'taxAmount'}
                onChange={(value) => update(index, { [name]: value })}
                inputMode="decimal"
              />
            ))}
          </div>
        </div>
      ))}
      {error ? (
        <p role="alert" tabIndex={-1} className="text-sm text-danger">
          {t(error)}
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={lines.length >= 100}
        onClick={() => onChange(JSON.stringify([...lines, newInvoiceLine()]))}
      >
        {t('addLine')}
      </Button>
    </fieldset>
  );
}
