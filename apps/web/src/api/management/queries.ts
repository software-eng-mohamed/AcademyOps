import { field, record, textValue } from '@/api/academy/models';
import * as sessions from '@/api/generated/academic/academic';
import * as attendance from '@/api/generated/attendance/attendance';
import * as accounts from '@/api/generated/business-accounts/business-accounts';
import * as certificates from '@/api/generated/certificates/certificates';
import * as finance from '@/api/generated/finance/finance';
import { AcademicControllerListV1Status } from '@/api/generated/models/academicControllerListV1Status';
import { BusinessAccountsControllerListV1Status } from '@/api/generated/models/businessAccountsControllerListV1Status';
import { CertificatesControllerListV1ValidityStatus } from '@/api/generated/models/certificatesControllerListV1ValidityStatus';
import { FinanceControllerInvoicesV1Status } from '@/api/generated/models/financeControllerInvoicesV1Status';
import { FinanceControllerPaymentsV1Status } from '@/api/generated/models/financeControllerPaymentsV1Status';
import * as reports from '@/api/generated/reports/reports';
import type {
  ManagementFilters,
  ManagementResource,
  ManagementRow,
} from '@/features/management/config';
import { cairoDayRange } from '@/lib/cairo-time';
import { readRosterEntry } from './attendance';

export const managementKey = (userId: string) => ['management', userId] as const;
function selected<T extends string>(value: string | undefined, options: Record<string, T>) {
  return Object.values(options).find((item) => item === value);
}
export function managementRow(resource: ManagementResource, value: unknown): ManagementRow {
  const data = record(value);
  const id = textValue(resource === 'aging' ? data.installmentId : data.id || data.enrollmentId);
  if (!id) throw new Error('Invalid management record');
  const name =
    resource === 'sessions'
      ? field(data, 'module.name') || field(data, 'cohort.name')
      : resource === 'roster' || resource === 'certificates'
        ? field(data, 'student.name')
        : resource === 'businessAccounts'
          ? data.displayName || data.legalName
          : resource === 'exports'
            ? data.reportType
            : resource === 'aging'
              ? data.installmentId
              : data.serialNumber || data.externalReference;
  return {
    id,
    name: textValue(name) || id.slice(0, 8),
    code: textValue(data.serial || field(data, 'student.publicId')),
    status: textValue(data.status || data.validityStatus || data.effectiveStatus),
    version: typeof data.version === 'number' ? data.version : 0,
    data,
  };
}
export type ManagementData = {
  items: ManagementRow[];
  nextCursor: string | null;
  pages?: number;
  total?: number;
  summary?: Record<string, unknown>;
  session?: Record<string, unknown>;
};
export async function getManagementPage(
  resource: ManagementResource,
  filters: ManagementFilters,
  signal?: AbortSignal,
): Promise<ManagementData> {
  const request = { signal: signal ?? null };
  // Use the server's page-size default; several generated limit schemas are incorrectly Object.
  const common = { ...(filters.cursor ? { cursor: filters.cursor } : {}) };
  let result: unknown;
  switch (resource) {
    case 'sessions': {
      const status = selected(filters.status, AcademicControllerListV1Status);
      const from = filters.from ? cairoDayRange(filters.from).from : undefined;
      const to = filters.to ? cairoDayRange(filters.to).to : undefined;
      result = (
        await sessions.academicControllerListV1(
          {
            ...common,
            ...(filters.cohortId ? { cohortId: filters.cohortId } : {}),
            ...(filters.roomId ? { roomId: filters.roomId } : {}),
            ...(filters.trainerId ? { trainerId: filters.trainerId } : {}),
            ...(status ? { status } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          },
          request,
        )
      ).data;
      break;
    }
    case 'roster': {
      if (!filters.sessionId) throw new Error('Session is required');
      result = (await attendance.attendanceControllerRosterV1(filters.sessionId, common, request))
        .data;
      break;
    }
    case 'businessAccounts': {
      const status = selected(filters.status, BusinessAccountsControllerListV1Status);
      result = (
        await accounts.businessAccountsControllerListV1(
          {
            ...common,
            ...(filters.search ? { search: filters.search } : {}),
            ...(status ? { status } : {}),
          },
          request,
        )
      ).data;
      break;
    }
    case 'certificates': {
      const validityStatus = selected(filters.status, CertificatesControllerListV1ValidityStatus);
      result = (
        await certificates.certificatesControllerListV1(
          { ...common, ...(validityStatus ? { validityStatus } : {}) },
          request,
        )
      ).data;
      break;
    }
    case 'payments': {
      const status = selected(filters.status, FinanceControllerPaymentsV1Status);
      result = (
        await finance.financeControllerPaymentsV1(
          { ...common, ...(status ? { status } : {}) },
          request,
        )
      ).data;
      break;
    }
    case 'invoices': {
      const status = selected(filters.status, FinanceControllerInvoicesV1Status);
      result = (
        await finance.financeControllerInvoicesV1(
          { ...common, ...(status ? { status } : {}) },
          request,
        )
      ).data;
      break;
    }
    case 'receipts':
      result = (await finance.financeControllerReceiptsV1(common, request)).data;
      break;
    case 'exports':
      result = (await reports.reportingControllerListExportsV1(common, request)).data;
      break;
    case 'aging': {
      const [aging, receivables] = await Promise.all([
        finance.financeControllerAgingV1(undefined, request),
        reports.reportingControllerFinanceReceivablesV1(undefined, request),
      ]);
      const rows = aging.data.rows;
      const page = Math.max(1, filters.page ?? 1);
      return {
        items: rows
          .slice((page - 1) * 25, page * 25)
          .map((item) =>
            managementRow(resource, { ...item, currencyCode: aging.data.currencyCode }),
          ),
        nextCursor: null,
        pages: Math.max(1, Math.ceil(rows.length / 25)),
        total: rows.length,
        summary: { ...receivables.data, agingTotals: aging.data.totals },
      };
    }
  }
  const page = record(result);
  if (!Array.isArray(page.items)) throw new Error('Invalid management page');
  return {
    items: page.items.map((item) =>
      managementRow(
        resource,
        resource === 'roster' ? { ...record(item), session: page.session } : item,
      ),
    ),
    nextCursor: textValue(page.nextCursor) || null,
    ...(page.session ? { session: record(page.session) } : {}),
  };
}
export async function getManagementDetail(
  resource: ManagementResource,
  row: ManagementRow,
  signal?: AbortSignal,
): Promise<ManagementRow> {
  const request = { signal: signal ?? null };
  let result: unknown;
  switch (resource) {
    case 'roster': {
      const sessionId = textValue(field(row.data, 'session.id'));
      if (!sessionId) throw new Error('Session is required');
      result = await readRosterEntry(sessionId, textValue(row.data.enrollmentId), signal);
      if (!result) throw new Error('Attendance roster entry not found');
      break;
    }
    case 'sessions':
      result = (await sessions.academicControllerReadV1(row.id, request)).data;
      break;
    case 'businessAccounts':
      result = (await accounts.businessAccountsControllerReadV1(row.id, request)).data;
      break;
    case 'certificates':
      result = (await certificates.certificatesControllerReadV1(row.id, request)).data;
      break;
    case 'payments':
      result = (await finance.financeControllerPaymentV1(row.id, request)).data;
      break;
    case 'invoices':
      result = (await finance.financeControllerInvoiceV1(row.id, request)).data;
      break;
    case 'receipts':
      result = (await finance.financeControllerReceiptV1(row.id, request)).data;
      break;
    default:
      return row;
  }
  return managementRow(resource, result);
}
export async function getManagementDownload(resource: 'certificates' | 'exports', id: string) {
  const response =
    resource === 'certificates'
      ? await certificates.certificatesControllerDownloadV1(id)
      : await reports.reportingControllerDownloadExportV1(id);
  const url = new URL(response.data.url, window.location.origin);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error('Unsafe download URL');
  return url.href;
}
