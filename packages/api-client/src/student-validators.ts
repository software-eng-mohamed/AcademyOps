import { PlgApiError } from './errors.js';
import type {
  CertificateDownloadResult,
  CertificateEligibility,
  InstallmentsPage,
} from './student-models.js';

function invalidResponse(): never {
  throw new PlgApiError(500, {
    code: 'RESPONSE_INVALID',
    messageKey: 'errors.requestFailed',
  });
}

function isObj(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isValidDueDate(value: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}` === value;
}

function isValidExpiresAt(value: string): boolean {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (!isoRegex.test(value)) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString() === value;
}

export function validateInstallmentsPage(data: unknown): InstallmentsPage {
  if (!isObj(data) || !Array.isArray(data.items)) invalidResponse();
  if (data.nextCursor !== null && typeof data.nextCursor !== 'string') invalidResponse();

  const allowedStates = new Set(['PAID', 'PARTIALLY_PAID', 'OVERDUE', 'DUE', 'UPCOMING']);
  const decimalRegex = /^\d+(\.\d+)?$/;
  const currencyRegex = /^[A-Z]{3}$/;

  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.ordinal !== 'number' ||
      !Number.isInteger(item.ordinal) ||
      item.ordinal <= 0 ||
      typeof item.dueDate !== 'string' ||
      !isValidDueDate(item.dueDate) ||
      typeof item.originalAmount !== 'string' ||
      !decimalRegex.test(item.originalAmount) ||
      typeof item.allocatedAmount !== 'string' ||
      !decimalRegex.test(item.allocatedAmount) ||
      typeof item.outstandingAmount !== 'string' ||
      !decimalRegex.test(item.outstandingAmount) ||
      typeof item.currency !== 'string' ||
      !currencyRegex.test(item.currency) ||
      typeof item.state !== 'string' ||
      !allowedStates.has(item.state) ||
      typeof item.payable !== 'boolean'
    ) {
      invalidResponse();
    }
  }

  return data as InstallmentsPage;
}

export function validateCertificateEligibility(data: unknown): CertificateEligibility {
  if (!isObj(data)) invalidResponse();

  const decimalRegex = /^\d+(\.\d+)?$/;

  if (
    (data.attendanceRatio !== null && typeof data.attendanceRatio !== 'string') ||
    (data.attendanceRatio !== null && !decimalRegex.test(data.attendanceRatio)) ||
    typeof data.minimumRatio !== 'string' ||
    !decimalRegex.test(data.minimumRatio) ||
    typeof data.outstanding !== 'string' ||
    !decimalRegex.test(data.outstanding) ||
    (data.academicEligibility !== 'ELIGIBLE' && data.academicEligibility !== 'INELIGIBLE') ||
    typeof data.financialHold !== 'boolean' ||
    typeof data.completionSatisfied !== 'boolean' ||
    typeof data.overallEligibility !== 'boolean' ||
    typeof data.ruleId !== 'string'
  ) {
    invalidResponse();
  }

  const attVal = data.attendanceRatio !== null ? parseFloat(data.attendanceRatio) : null;
  const minVal = parseFloat(data.minimumRatio);
  const outVal = parseFloat(data.outstanding);

  if (
    (attVal !== null &&
      (Number.isNaN(attVal) || !Number.isFinite(attVal) || attVal < 0 || attVal > 1)) ||
    Number.isNaN(minVal) ||
    !Number.isFinite(minVal) ||
    minVal < 0.8 ||
    minVal > 1 ||
    Number.isNaN(outVal) ||
    !Number.isFinite(outVal) ||
    outVal < 0
  ) {
    invalidResponse();
  }

  const expectedAcademic = attVal !== null && attVal >= minVal ? 'ELIGIBLE' : 'INELIGIBLE';
  if (data.academicEligibility !== expectedAcademic) {
    invalidResponse();
  }

  const expectedFinancialHold = outVal > 0;
  if (data.financialHold !== expectedFinancialHold) {
    invalidResponse();
  }

  const expectedOverall = data.academicEligibility === 'ELIGIBLE' && !data.financialHold;
  if (data.overallEligibility !== expectedOverall) {
    invalidResponse();
  }

  return data as CertificateEligibility;
}

export function validateCertificateDownloadResult(data: unknown): CertificateDownloadResult {
  if (!isObj(data) || typeof data.url !== 'string' || typeof data.expiresAt !== 'string') {
    invalidResponse();
  }

  if (!isValidExpiresAt(data.expiresAt)) {
    invalidResponse();
  }

  try {
    const u = new URL(data.url);
    if (u.protocol !== 'https:') {
      invalidResponse();
    }
  } catch {
    invalidResponse();
  }

  return data as CertificateDownloadResult;
}
