'use client';

import { AcademyCard, AnimatedNumber } from '@academyops/ui/academy';
import {
  Award,
  Building,
  Calendar1,
  DocumentDownload,
  ReceiptItem,
  TickSquare,
  Wallet2,
} from 'iconsax-react';
import { field, record, textValue } from '@/api/academy/models';
import detailStyles from '@/features/academy/academy-detail-styles';
import layoutStyles from '@/features/academy/academy-styles';
import { DirectoryAvatar } from '@/features/academy/academy-surfaces';
import {
  DirectoryStatus,
  formatAcademyDate,
  formatAcademyDateTime,
} from '@/features/academy/academy-ui';
import { managementText } from '@/i18n/management-copy';
import type { Locale } from '@/lib/locales';
import type { ManagementResource, ManagementRow, ManagementSection } from './config';

export function ManagementAvatar({
  row,
  resource,
  large = false,
}: {
  row: ManagementRow;
  resource: ManagementResource;
  large?: boolean;
}) {
  return (
    <DirectoryAvatar
      large={large}
      {...(['certificates', 'roster'].includes(resource) ? { name: row.name } : {})}
      icon={<ManagementIcon section={resource} className={large ? 'size-6' : 'size-4'} />}
    />
  );
}

export function ManagementIcon({
  section,
  className = 'size-5',
}: {
  section: ManagementSection | ManagementResource;
  className?: string;
}) {
  const Icon =
    section === 'sessions'
      ? Calendar1
      : section === 'attendance' || section === 'roster'
        ? TickSquare
        : section === 'certificates'
          ? Award
          : section === 'businessAccounts'
            ? Building
            : section === 'reports' || section === 'exports'
              ? DocumentDownload
              : section === 'documents' || section === 'invoices' || section === 'receipts'
                ? ReceiptItem
                : Wallet2;
  return <Icon aria-hidden variant="Bulk" color="currentColor" className={className} />;
}
export function ManagementStatus({ value, locale }: { value: string; locale: Locale }) {
  return <DirectoryStatus status={value} label={value ? managementText(locale, value) : '—'} />;
}
const moneyFields = new Set([
  'amount',
  'outstanding',
  'totalAmount',
  'subtotal',
  'taxAmount',
  'settledAmount',
  'creditedAmount',
  'refundedAmount',
  'balance',
  'totalDebits',
  'totalCredits',
  'outstandingDebits',
  'unappliedCredits',
  'unitAmount',
]);
const enumFields = new Set([
  'status',
  'effectiveStatus',
  'attendance.source',
  'deliveryMode',
  'attendanceWindowState',
  'validityStatus',
  'fulfillmentStatus',
  'pdfStatus',
  'refundStatus',
  'paymentStatus',
  'bucket',
  'academicResult',
]);
export function formatMoney(value: unknown, currency: unknown, locale: Locale) {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    value === '' ||
    !Number.isFinite(Number(value))
  )
    return '—';
  const code = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'EGP';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
export function ManagementValue({
  data,
  name,
  locale,
}: {
  data: Record<string, unknown>;
  name: string;
  locale: Locale;
}) {
  const value = field(data, name);
  if (value === null || value === undefined || value === '') return <>—</>;
  if (typeof value === 'boolean') return <>{managementText(locale, value ? 'yes' : 'no')}</>;
  if (name === 'type' || name === 'kind') return <>{managementText(locale, textValue(value))}</>;
  if (name === 'ageDays' && Number.isFinite(Number(value)))
    return <bdi className="tabular-nums">{Math.max(0, Number(value)).toLocaleString(locale)}</bdi>;
  if (enumFields.has(name)) return <ManagementStatus value={textValue(value)} locale={locale} />;
  if (moneyFields.has(name))
    return (
      <bdi className="font-medium tabular-nums text-ink">
        {formatMoney(value, data.currencyCode, locale)}
      </bdi>
    );
  if (name.endsWith('At') || name === 'attendance.recordedAt')
    return <>{formatAcademyDateTime(value, locale, '—')}</>;
  if (name === 'dueDate') return <>{formatAcademyDate(value, locale, '—')}</>;
  return <bdi className="break-words">{textValue(value) || '—'}</bdi>;
}
export function ManagementFacts({
  data,
  names,
  locale,
}: {
  data: Record<string, unknown>;
  names: string[];
  locale: Locale;
}) {
  return (
    <dl className={detailStyles.facts}>
      {names.map((name) => (
        <div key={name}>
          <dt>{managementText(locale, name)}</dt>
          <dd>
            <ManagementValue data={data} name={name} locale={locale} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function ReceivablesSummary({
  summary,
  locale,
}: {
  summary: Record<string, unknown>;
  locale: Locale;
}) {
  const totals = record(summary.totals);
  const aging = record(summary.agingTotals);
  const cards = [
    ['debits', totals.debits],
    ['allocated', totals.allocated],
    ['outstanding', totals.outstanding],
  ] as const;
  return (
    <section aria-label={managementText(locale, 'finance')} className="mb-6 space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(([key, value]) => (
          <AcademyCard key={key} className={layoutStyles.recordCard ?? ''}>
            <AcademyCard.Header className="flex-row items-center justify-between px-5 pt-5">
              <AcademyCard.Title className="text-sm font-medium text-ink-muted">
                {managementText(locale, key)}
              </AcademyCard.Title>
              <ManagementIcon section="finance" className="size-5 text-brand" />
            </AcademyCard.Header>
            <AcademyCard.Content className="px-5 pb-5 text-2xl font-semibold tabular-nums text-ink">
              <bdi>
                {typeof value === 'string' && value !== '' && Number.isFinite(Number(value)) ? (
                  <AnimatedNumber
                    value={Number(value)}
                    format={(number) => formatMoney(number, summary.currencyCode, locale)}
                  />
                ) : (
                  '—'
                )}
              </bdi>
            </AcademyCard.Content>
          </AcademyCard>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-muted">
        <span>
          {managementText(locale, 'asOf')}: {formatAcademyDate(summary.asOf, locale, '—')}
        </span>
        <span>
          {managementText(locale, 'enrollmentCount')}: {textValue(summary.enrollmentCount)}
        </span>
        <span>
          {managementText(locale, 'outstandingEnrollmentCount')}:{' '}
          {textValue(summary.outstandingEnrollmentCount)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Object.entries(aging).map(([key, value]) => (
          <div key={key} className="min-w-0 rounded-xl border border-border bg-surface px-4 py-3">
            <p className="mb-2 text-xs text-ink-muted">{managementText(locale, key)}</p>
            <bdi className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">
              {formatMoney(value, summary.currencyCode, locale)}
            </bdi>
          </div>
        ))}
      </div>
    </section>
  );
}
