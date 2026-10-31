import type { Prisma } from '@prisma/client';
import type { CalendarValue, MasterValue } from './import-values';

export function masterFinancialIssues(value: MasterValue): string[] {
  const issues: string[] = [];
  for (const evidence of value.paymentEvidenceIssues ?? []) issues.push(...evidence.codes);
  const importedPaid = value.payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (value.totalAmount < 0 || value.paidAmount < 0) issues.push('FINANCE_AMOUNT_INVALID');
  if (value.totalAmount <= 0 && (value.paidAmount > 0 || importedPaid > 0)) {
    issues.push('PRICING_TOTAL_MISSING_WITH_PAYMENT');
  } else {
    if (value.totalAmount > 0 && (value.subtotal <= 0 || value.subtotal < value.totalAmount))
      issues.push('PRICING_TOTAL_INVALID');
    if (value.totalAmount > 0 && value.paidAmount > value.totalAmount + 0.01)
      issues.push('PAYMENT_EXCEEDS_TOTAL');
  }
  if (Math.abs(importedPaid - value.paidAmount) > 0.01) issues.push('PAYMENT_BREAKDOWN_MISMATCH');
  return issues;
}

export function calendarConflictKeys(values: CalendarValue[]) {
  const counts = (keys: string[]) => {
    const totals = new Map<string, number>();
    keys.filter(Boolean).forEach((key) => totals.set(key, (totals.get(key) ?? 0) + 1));
    return new Set([...totals].filter(([, total]) => total > 1).map(([key]) => key));
  };
  return {
    sessions: counts(values.map((value) => `${value.cohortCode}|${value.sessionOrdinal}`)),
    rooms: overlapKeys(
      values.flatMap((value) =>
        value.roomCode
          ? [{ resource: value.roomCode, start: value.startsAt, end: value.endsAt }]
          : [],
      ),
    ),
    trainers: overlapKeys(
      values.flatMap((value) =>
        value.trainerName
          .split(/\\|\/|,/)
          .map((name) => name.trim())
          .filter(Boolean)
          .map((resource) => ({ resource, start: value.startsAt, end: value.endsAt })),
      ),
    ),
  };
}

function overlapKeys(
  entries: Array<{ resource: string; start: string; end: string }>,
): Set<string> {
  const conflicts = new Set<string>();
  for (let left = 0; left < entries.length; left += 1) {
    const a = entries[left]!;
    if (!a.start || !a.end) continue;
    for (let right = left + 1; right < entries.length; right += 1) {
      const b = entries[right]!;
      if (a.resource !== b.resource || !b.start || !b.end) continue;
      if (a.start < b.end && b.start < a.end) {
        conflicts.add(`${a.resource}|${a.start}|${a.end}`);
        conflicts.add(`${b.resource}|${b.start}|${b.end}`);
      }
    }
  }
  return conflicts;
}

export function sourceErrors(
  value: Prisma.JsonValue,
  ignoredRootKeys = new Set<string>(),
): string[] {
  const visit = (entry: Prisma.JsonValue | undefined): string[] => {
    if (entry === undefined) return [];
    if (Array.isArray(entry)) return entry.flatMap(visit);
    if (entry && typeof entry === 'object') {
      if ('error' in entry && typeof entry.error === 'string') return [entry.error];
      if (
        'formula' in entry &&
        'value' in entry &&
        typeof entry.value === 'string' &&
        entry.value.startsWith('#')
      ) {
        return [entry.value];
      }
      return Object.values(entry).flatMap(visit);
    }
    return [];
  };
  const errors =
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value)
          .filter(([key]) => !ignoredRootKeys.has(key))
          .flatMap(([, entry]) => visit(entry))
      : visit(value);
  return errors.map((error) => `SOURCE_${error.replace(/[^A-Z0-9]/gi, '_')}`);
}
