'use client';

import { useMemo } from 'react';
import { record } from '@/api/academy/models';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';
import { StructuredValues, SystemSelect } from './system-ui';

type Values = Record<string, unknown>;

export function prepareImportCorrectionValues(value: Values): Values {
  const result = structuredClone(value);
  const evidence = Array.isArray(result.paymentEvidenceIssues)
    ? result.paymentEvidenceIssues.map(record)
    : [];
  if (evidence.length) {
    result.payments = [
      ...(Array.isArray(result.payments) ? result.payments : []),
      ...evidence.map((entry) => ({
        amount: entry.amount ?? 0,
        method: entry.method ?? '',
        receivedAt: entry.receivedAt ?? '',
        sourceOrdinal: entry.ordinal,
      })),
    ];
    result.paymentEvidenceIssues = [];
  }
  return result;
}

export function ImportCorrectionFields({
  value,
  onChange,
  locale,
}: {
  value: Values;
  onChange: (value: Values) => void;
  locale: Locale;
}) {
  const entries = useMemo(() => Object.entries(value), [value]);
  return (
    <div className="grid min-w-0 gap-3">
      {entries.map(([key, entry]) => (
        <div key={key} className="min-w-0">
          {key === 'payments' && Array.isArray(entry) ? (
            <PaymentFields
              value={entry.map(record)}
              onChange={(payments) => onChange({ ...value, payments })}
              locale={locale}
            />
          ) : key === 'attendance' && Array.isArray(entry) ? (
            <AttendanceFields
              value={entry.map(record)}
              onChange={(attendance) => onChange({ ...value, attendance })}
              locale={locale}
            />
          ) : typeof entry === 'boolean' ? (
            <Checkbox isSelected={entry} onChange={(next) => onChange({ ...value, [key]: next })}>
              {systemText(locale, key)}
            </Checkbox>
          ) : entry !== null && typeof entry === 'object' ? (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm">{systemText(locale, key)}</summary>
              <div className="mt-3">
                <StructuredValues value={entry} locale={locale} />
              </div>
            </details>
          ) : (
            <Input
              label={systemText(locale, key)}
              value={entry === null ? '' : String(entry)}
              onChange={(next) =>
                onChange({
                  ...value,
                  [key]:
                    typeof entry === 'number'
                      ? next.trim() && Number.isFinite(Number(next))
                        ? Number(next)
                        : next
                      : next,
                })
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

function PaymentFields({
  value,
  onChange,
  locale,
}: {
  value: Values[];
  onChange: (value: Values[]) => void;
  locale: Locale;
}) {
  const update = (index: number, key: string, next: unknown) =>
    onChange(
      value.map((entry, current) => (current === index ? { ...entry, [key]: next } : entry)),
    );
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{systemText(locale, 'payments')}</legend>
      {value.map((payment, index) => (
        <div
          key={`payment-${String(payment.sourceOrdinal)}`}
          className="grid gap-2 rounded-lg bg-surface-subtle p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-ink-muted">
              {systemText(locale, 'sourceOrdinal')}: {String(payment.sourceOrdinal ?? index + 1)}
            </span>
            <Button
              variant="ghost"
              onClick={() => onChange(value.filter((_, item) => item !== index))}
            >
              {systemText(locale, 'remove')}
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              label={systemText(locale, 'amount')}
              inputMode="decimal"
              value={String(payment.amount ?? '')}
              onChange={(next) => update(index, 'amount', next.trim() ? Number(next) : next)}
            />
            <Input
              label={systemText(locale, 'method')}
              value={String(payment.method ?? '')}
              onChange={(next) => update(index, 'method', next)}
            />
            <Input
              label={systemText(locale, 'receivedAt')}
              value={String(payment.receivedAt ?? '')}
              onChange={(next) => update(index, 'receivedAt', next)}
            />
          </div>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          onChange([
            ...value,
            { amount: 0, method: '', receivedAt: '', sourceOrdinal: nextOrdinal(value, 9) },
          ])
        }
      >
        {systemText(locale, 'addPayment')}
      </Button>
    </fieldset>
  );
}

function AttendanceFields({
  value,
  onChange,
  locale,
}: {
  value: Values[];
  onChange: (value: Values[]) => void;
  locale: Locale;
}) {
  const update = (index: number, key: string, next: unknown) =>
    onChange(
      value.map((entry, current) => (current === index ? { ...entry, [key]: next } : entry)),
    );
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{systemText(locale, 'attendance')}</legend>
      {value.map((mark, index) => (
        <div
          key={`attendance-${String(mark.sourceMarkColumn ?? 'new')}-${String(mark.sourceCohortColumn ?? '')}-${String(mark.ordinal)}`}
          className="grid gap-2 rounded-lg bg-surface-subtle p-3"
        >
          {mark.sourceMarkColumn || mark.sourceCohortColumn ? (
            <p className="text-xs text-ink-muted">
              {systemText(locale, 'sourceColumns')}: {String(mark.sourceMarkColumn ?? '—')} /{' '}
              {String(mark.sourceCohortColumn ?? '—')}
            </p>
          ) : null}
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              label={systemText(locale, 'sourceOrdinal')}
              inputMode="numeric"
              value={String(mark.ordinal ?? '')}
              onChange={(next) => update(index, 'ordinal', next.trim() ? Number(next) : next)}
            />
            <Input
              label={systemText(locale, 'cohortCode')}
              value={String(mark.cohortCode ?? '')}
              onChange={(next) => update(index, 'cohortCode', next)}
            />
            <SystemSelect
              label={systemText(locale, 'status')}
              value={String(mark.status ?? '')}
              options={['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']}
              onChange={(next) => update(index, 'status', next)}
              locale={locale}
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => onChange(value.filter((_, item) => item !== index))}
          >
            {systemText(locale, 'remove')}
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          onChange([
            ...value,
            { ordinal: nextOrdinal(value, 28), cohortCode: '', status: 'ABSENT' },
          ])
        }
      >
        {systemText(locale, 'addAttendance')}
      </Button>
    </fieldset>
  );
}

function nextOrdinal(values: Values[], maximum: number): number {
  const used = new Set(values.map((value) => Number(value.sourceOrdinal ?? value.ordinal)));
  for (let ordinal = 1; ordinal <= maximum; ordinal += 1) if (!used.has(ordinal)) return ordinal;
  return maximum;
}
