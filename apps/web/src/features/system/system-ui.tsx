'use client';

import { Field } from '@academyops/ui';
import { Badge } from '@academyops/ui/registry';
import { Archive, DocumentUpload, SecurityUser, ShieldTick, Whatsapp } from 'iconsax-react';
import { useId } from 'react';
import { record } from '@/api/academy/models';
import { Select, SelectItem } from '@/components/base/select/select';
import { formatAcademyDateTime } from '@/features/academy/academy-ui';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';
import type { SystemSection } from './config';

export function SystemIcon({
  section,
  className = 'size-5',
}: {
  section: SystemSection;
  className?: string;
}) {
  const Icon = {
    access: SecurityUser,
    imports: DocumentUpload,
    audit: ShieldTick,
    legacyArchive: Archive,
    whatsapp: Whatsapp,
  }[section];
  return <Icon aria-hidden color="currentColor" variant="Bulk" className={className} />;
}
export function SystemSelect({
  label,
  value,
  options,
  onChange,
  locale,
  invalid = false,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  locale: Locale;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <Select
        triggerId={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        isDisabled={disabled}
        selectedKey={value || null}
        renderValue={value ? systemText(locale, value) : undefined}
        onSelectionChange={(key) => onChange(String(key ?? ''))}
        triggerClassName="min-h-10"
        className="w-full"
      >
        {options.map((option) => (
          <SelectItem key={option} id={option} textValue={systemText(locale, option)}>
            {systemText(locale, option)}
          </SelectItem>
        ))}
      </Select>
    </Field>
  );
}
export function SystemStatus({ value, locale }: { value: unknown; locale: Locale }) {
  const text = String(value ?? '');
  return (
    <Badge
      variant="outline"
      className={
        ['ACTIVE', 'CONNECTED', 'FINALIZED', 'RECONCILED', 'RESOLVED'].includes(text)
          ? 'border-brand/20 bg-brand-soft text-brand'
          : 'border-border bg-surface text-ink-muted'
      }
    >
      {systemText(locale, text) || '—'}
    </Badge>
  );
}
export function SystemValue({
  value,
  name = '',
  locale,
  literal = false,
}: {
  value: unknown;
  name?: string;
  locale: Locale;
  literal?: boolean;
}) {
  if (value === null || value === undefined || value === '')
    return <span className="text-ink-muted">—</span>;
  if (literal) return <bdi className="[overflow-wrap:anywhere]">{String(value)}</bdi>;
  if (typeof value === 'boolean') return <span>{systemText(locale, value ? 'yes' : 'no')}</span>;
  if (name === 'status' || name === 'state') return <SystemStatus value={value} locale={locale} />;
  if (name.endsWith('At')) return <span>{formatAcademyDateTime(value, locale, '—')}</span>;
  if (Array.isArray(value))
    return (
      <span className="flex flex-wrap gap-1">
        {value.length
          ? value.map((entry, index) => (
              <Badge
                key={String(record(entry).id ?? index)}
                variant="outline"
                className="border-border text-ink"
              >
                {String(record(entry).name ?? record(entry).code ?? entry)}
              </Badge>
            ))
          : '—'}
      </span>
    );
  return <bdi className="[overflow-wrap:anywhere]">{systemText(locale, String(value))}</bdi>;
}
// Backend audit/archive payloads have varying schemas. Preserve their structure, not a raw JSON dump.
export function StructuredValues({
  value,
  locale,
  literal = false,
}: {
  value: unknown;
  locale: Locale;
  literal?: boolean;
}) {
  if (value === null || typeof value !== 'object')
    return <SystemValue value={value} locale={locale} literal={literal} />;
  const entries = Object.entries(value);
  if (!entries.length) return <span className="text-ink-muted">—</span>;
  return (
    <dl className="grid min-w-0 gap-3">
      {entries.map(([key, entry]) => (
        <div key={key} className="min-w-0 rounded-lg border border-border bg-surface-subtle p-3">
          <dt className="mb-2 text-xs font-medium text-ink-muted [overflow-wrap:anywhere]">
            {literal ? key : systemText(locale, key)}
          </dt>
          <dd className="min-w-0 text-sm [overflow-wrap:anywhere]">
            {entry !== null && typeof entry === 'object' ? (
              <StructuredValues value={entry} locale={locale} literal={literal} />
            ) : (
              <SystemValue value={entry} name={key} locale={locale} literal={literal} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
