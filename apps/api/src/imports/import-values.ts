import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { normalizeEgyptPhone, normalizeEmail, normalizeText } from './normalization';
import type { XlsxScalar } from './xlsx-reader';
export const targetSheets = ['Master Sheet', 'Attendance & Cert.', 'Annual Calendar - 2026'];
export { deriveAttendanceSessionCount, parseAttendance } from './import-attendance-values';
export type { AttendanceRowValue, AttendanceValue } from './import-attendance-values';
export type PaymentValue = {
  amount: number;
  method: string;
  receivedAt: string;
  sourceOrdinal?: number;
};
export type PaymentEvidenceIssue = {
  ordinal: number;
  amount: number;
  method: string;
  receivedAt: string;
  codes: Array<'PAYMENT_DATE_REQUIRED' | 'PAYMENT_METHOD_REQUIRED'>;
};
export type MasterValue = {
  legacyCode: string;
  state: string;
  telesalesAgent?: string;
  acquisitionSource?: string;
  secondaryCode?: string;
  name: string;
  phone: string | null;
  email: string | null;
  kind: string;
  branch: string;
  deliveryMode: string;
  programCode: string;
  cohortCode: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  workbookShouldPaid?: number;
  workbookRemaining?: number;
  payments: PaymentValue[];
  paymentEvidenceIssues?: PaymentEvidenceIssue[];
};
export type CalendarValue = {
  programName: string;
  programCode: string;
  cohortCode: string;
  sessionOrdinal: number;
  moduleName: string;
  trainerName: string;
  sourceWallStart: string;
  sourceWallEnd: string;
  startsAt: string;
  endsAt: string;
  roomCode: string;
  deliveryMode: string;
  coordinatorName?: string;
};
function scalar(value: XlsxScalar | undefined): string | number | boolean | null {
  if (value && typeof value === 'object') {
    if ('formula' in value) return scalar(value.value);
    return null;
  }
  return value ?? null;
}
const text = (value: XlsxScalar | undefined): string => normalizeText(scalar(value)) ?? '';
const amount = (value: XlsxScalar | undefined): number => {
  const parsed = Number(scalar(value));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};
const optionalAmount = (value: XlsxScalar | undefined): number | undefined => {
  const raw = scalar(value);
  if (raw === null || (typeof raw === 'string' && !raw.trim())) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : undefined;
};
function excelDate(value: XlsxScalar | undefined): Date | null {
  const raw = scalar(value);
  if (typeof raw === 'number') return new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const slash = /^(\d{1,2})[.\\/-](\d{1,2})[.\\/-](\d{2,4})$/.exec(raw.trim());
  if (slash) {
    const year = Number(slash[3]) + (Number(slash[3]) < 100 ? 2000 : 0);
    return new Date(Date.UTC(year, Number(slash[2]) - 1, Number(slash[1])));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function annualDate(value: XlsxScalar | undefined, sheetYear: number): Date | null {
  const raw = text(value);
  const match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)-(\d{1,2})-([A-Za-z]{3})$/i.exec(raw);
  if (!match) return excelDate(value);
  for (const year of [sheetYear - 1, sheetYear, sheetYear + 1]) {
    const candidate = new Date(`${match[2]} ${match[3]} ${year} 00:00:00Z`);
    if (candidate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) === match[1]) {
      return candidate;
    }
  }
  return null;
}
function atCairoTime(date: Date, value: XlsxScalar | undefined): Date | null {
  const raw = scalar(value);
  if (typeof raw !== 'number' || raw < 0 || raw >= 1) return null;
  const minutes = Math.round(raw * 24 * 60);
  const wallUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  );
  let instant = wallUtc - cairoOffsetAt(new Date(wallUtc));
  instant = wallUtc - cairoOffsetAt(new Date(instant));
  return new Date(instant);
}
function sourceWallTime(date: Date, value: XlsxScalar | undefined): string {
  const raw = scalar(value);
  if (typeof raw !== 'number' || raw < 0 || raw >= 1) return '';
  const minutes = Math.round(raw * 24 * 60);
  const day = date.toISOString().slice(0, 10);
  return `${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
}
function cairoOffsetAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const localAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return localAsUtc - instant.getTime();
}
export function codeFrom(value: string, fallback = 'LEGACY'): string {
  const slug = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (
    slug || `${fallback}-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
  ).slice(0, 50);
}
export function parseMaster(raw: Record<string, XlsxScalar>): MasterValue {
  const subtotal = amount(raw.O);
  const totalAmount = amount(raw.Q);
  const payments: PaymentValue[] = [];
  const paymentEvidenceIssues: PaymentEvidenceIssue[] = [];
  const paymentColumns = [
    ['U', 'V', 'W'],
    ['X', 'Y', 'Z'],
    ['AA', 'AB', 'AC'],
    ['AD', 'AE', 'AF'],
    ['AG', 'AH', 'AI'],
    ['AJ', 'AK', 'AL'],
    ['AM', 'AN', 'AO'],
    ['AP', 'AQ', 'AR'],
    ['AS', 'AT', 'AU'],
  ] as const;
  for (let index = 0; index < paymentColumns.length; index += 1) {
    const [amountColumn, methodColumn, dateColumn] = paymentColumns[index]!;
    const paymentAmount = amount(raw[amountColumn]);
    const method = text(raw[methodColumn]);
    const date = excelDate(raw[dateColumn]);
    if (paymentAmount <= 0) continue;
    const codes: PaymentEvidenceIssue['codes'] = [];
    if (!date) codes.push('PAYMENT_DATE_REQUIRED');
    if (!method) codes.push('PAYMENT_METHOD_REQUIRED');
    if (codes.length) {
      paymentEvidenceIssues.push({
        ordinal: index + 1,
        amount: paymentAmount,
        method,
        receivedAt: text(raw[dateColumn]),
        codes,
      });
    } else if (date) {
      payments.push({
        amount: paymentAmount,
        method,
        receivedAt: date.toISOString(),
        sourceOrdinal: index + 1,
      });
    }
  }
  const discountRatio = amount(raw.P);
  const workbookShouldPaid = optionalAmount(raw.R);
  const workbookRemaining = optionalAmount(raw.S);
  return {
    legacyCode: text(raw.A),
    state: text(raw.B),
    telesalesAgent: text(raw.C),
    name: text(raw.D),
    phone: normalizeEgyptPhone(scalar(raw.F)),
    email: normalizeEmail(scalar(raw.G)),
    acquisitionSource: text(raw.H),
    kind: text(raw.I),
    secondaryCode: text(raw.J),
    branch: text(raw.K) || 'MAIN',
    deliveryMode: normalizeDelivery(text(raw.L)),
    programCode: codeFrom(text(raw.M)),
    cohortCode: text(raw.N),
    subtotal,
    discountAmount: Math.max(
      0,
      Math.round((subtotal - totalAmount || subtotal * discountRatio) * 100) / 100,
    ),
    totalAmount,
    paidAmount: amount(raw.T),
    ...(workbookShouldPaid === undefined ? {} : { workbookShouldPaid }),
    ...(workbookRemaining === undefined ? {} : { workbookRemaining }),
    payments,
    paymentEvidenceIssues,
  };
}
export function parseCalendar(raw: Record<string, XlsxScalar>, sheetName: string): CalendarValue {
  const year = Number(/(20\d{2})/.exec(sheetName)?.[1] ?? new Date().getUTCFullYear());
  const date = annualDate(raw.G, year);
  const start = date ? atCairoTime(date, raw.J) : null;
  const end = date ? atCairoTime(date, raw.K) : null;
  const cohortCode = text(raw.C);
  return {
    programName: text(raw.B),
    programCode: codeFrom(cohortCode.replace(/[\s-]*\d+$/, '')),
    cohortCode,
    sessionOrdinal: Number(text(raw.D).replace(/\D/g, '')),
    moduleName: text(raw.E),
    trainerName: text(raw.F),
    sourceWallStart: date ? sourceWallTime(date, raw.J) : '',
    sourceWallEnd: date ? sourceWallTime(date, raw.K) : '',
    startsAt: start?.toISOString() ?? '',
    endsAt: end?.toISOString() ?? '',
    roomCode: text(raw.H),
    deliveryMode: normalizeDelivery(text(raw.I)),
    coordinatorName: text(raw.L),
  };
}
export const jsonObject = (value: object): Prisma.InputJsonObject => value;
export const asObject = <T>(value: Prisma.JsonValue | null): T => value as unknown as T;
export const masterEnrollmentKey = (value: { legacyCode: string; cohortCode: string }): string =>
  `${value.legacyCode.trim().toUpperCase()}|${value.cohortCode.trim().toUpperCase()}`;
function normalizeDelivery(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized.includes('HY') || normalized.includes('HYP')) return 'HYBRID';
  if (normalized.includes('ONLINE')) return 'ONLINE';
  return 'IN_PERSON';
}
