import { PlgApiError } from './errors.js';
import type {
  AcademicCalendarResult,
  EnrollmentAttendanceSummary,
  EnrollmentFinanceSummary,
  FinanceAgingReport,
  FinanceReceivablesReport,
  StudentCertificatesPage,
  StudentEnrollment,
  StudentEnrollmentsPage,
} from './models.js';

function invalidResponse(..._args: unknown[]): never {
  if (_args) {
    // ignore
  }
  throw new PlgApiError(500, {
    code: 'RESPONSE_INVALID',
    messageKey: 'errors.requestFailed',
  });
}
function isObj(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}
export function validateFinanceReceivables(data: unknown): FinanceReceivablesReport {
  if (!isObj(data)) invalidResponse('receivables top-level is not an object');
  if (typeof data.asOf !== 'string' || typeof data.currencyCode !== 'string')
    invalidResponse('receivables header invalid');
  if (
    typeof data.enrollmentCount !== 'number' ||
    typeof data.outstandingEnrollmentCount !== 'number'
  )
    invalidResponse('receivables counts invalid');
  if (!isObj(data.totals)) invalidResponse('receivables totals invalid');
  if (
    typeof data.totals.debits !== 'string' ||
    typeof data.totals.allocated !== 'string' ||
    typeof data.totals.outstanding !== 'string'
  ) {
    invalidResponse('receivables totals fields invalid');
  }
  return data as unknown as FinanceReceivablesReport;
}
export function validateFinanceAging(data: unknown): FinanceAgingReport {
  if (!isObj(data)) invalidResponse('aging top-level is not an object');
  if (typeof data.asOf !== 'string' || typeof data.currencyCode !== 'string')
    invalidResponse('aging header invalid');
  if (!isObj(data.totals) || !Array.isArray(data.rows))
    invalidResponse('aging totals or rows invalid');
  for (const r of data.rows) {
    if (
      !isObj(r) ||
      typeof r.installmentId !== 'string' ||
      typeof r.dueDate !== 'string' ||
      typeof r.ageDays !== 'number' ||
      typeof r.bucket !== 'string' ||
      typeof r.outstanding !== 'string'
    ) {
      invalidResponse('aging row invalid');
    }
  }
  return data as unknown as FinanceAgingReport;
}
export function validateAcademicCalendar(data: unknown): AcademicCalendarResult {
  if (!isObj(data)) invalidResponse('calendar top-level is not an object');
  if (typeof data.from !== 'string' || typeof data.to !== 'string' || !Array.isArray(data.items))
    invalidResponse('calendar header invalid');
  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.cohortId !== 'string' ||
      typeof item.startsAt !== 'string' ||
      (item.endsAt !== null && typeof item.endsAt !== 'string') ||
      typeof item.status !== 'string' ||
      typeof item.attendanceWindowState !== 'string' ||
      typeof item.deliveryMode !== 'string' ||
      !Array.isArray(item.trainers)
    ) {
      invalidResponse('calendar item invalid');
    }
    for (const tr of item.trainers) {
      if (
        !isObj(tr) ||
        typeof tr.id !== 'string' ||
        typeof tr.sessionId !== 'string' ||
        typeof tr.trainerId !== 'string' ||
        typeof tr.bookingStatus !== 'string'
      ) {
        invalidResponse('session trainer assignment invalid');
      }
    }
    if (item.cohort !== null) {
      const co = item.cohort;
      if (
        !isObj(co) ||
        typeof co.id !== 'string' ||
        typeof co.code !== 'string' ||
        (co.name !== null && typeof co.name !== 'string')
      ) {
        invalidResponse('calendar cohort invalid');
      }
    }
    if (item.room !== null) {
      const rm = item.room;
      if (
        !isObj(rm) ||
        typeof rm.id !== 'string' ||
        typeof rm.code !== 'string' ||
        typeof rm.name !== 'string' ||
        typeof rm.name !== 'string'
      ) {
        invalidResponse('calendar room invalid');
      }
    }
  }
  return data as unknown as AcademicCalendarResult;
}
export function validateStudentEnrollmentsPage(data: unknown): StudentEnrollmentsPage {
  if (
    !isObj(data) ||
    !Array.isArray(data.items) ||
    (data.nextCursor !== null && typeof data.nextCursor !== 'string')
  ) {
    invalidResponse('enrollments page structure invalid');
  }
  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.version !== 'number' ||
      typeof item.studentPersonId !== 'string' ||
      typeof item.billingAccountId !== 'string' ||
      typeof item.programVersionId !== 'string' ||
      typeof item.homeBranchId !== 'string' ||
      typeof item.state !== 'string'
    ) {
      invalidResponse('enrollment item invalid');
    }
    if (item.student !== null) {
      const st = item.student;
      if (
        !isObj(st) ||
        typeof st.id !== 'string' ||
        typeof st.publicId !== 'string' ||
        (st.name !== null && typeof st.name !== 'string') ||
        (st.name !== null && typeof st.name !== 'string')
      ) {
        invalidResponse('enrollment student invalid');
      }
    }
    if (item.programVersion !== null) {
      const pv = item.programVersion;
      if (
        !isObj(pv) ||
        typeof pv.id !== 'string' ||
        typeof pv.programId !== 'string' ||
        typeof pv.version !== 'number' ||
        typeof pv.status !== 'string'
      ) {
        invalidResponse('enrollment programVersion invalid');
      }
    }
    if (item.program !== null) {
      const pr = item.program;
      if (
        !isObj(pr) ||
        typeof pr.id !== 'string' ||
        typeof pr.code !== 'string' ||
        (pr.name !== null && typeof pr.name !== 'string') ||
        (pr.name !== null && typeof pr.name !== 'string')
      ) {
        invalidResponse('enrollment program invalid');
      }
    }
    if (item.cohort !== null) {
      const co = item.cohort;
      if (
        !isObj(co) ||
        typeof co.id !== 'string' ||
        typeof co.code !== 'string' ||
        (co.name !== null && typeof co.name !== 'string')
      ) {
        invalidResponse('enrollment cohort invalid');
      }
    }
  }
  return data as unknown as StudentEnrollmentsPage;
}
export function validateAttendanceSummary(data: unknown): EnrollmentAttendanceSummary {
  if (!isObj(data)) invalidResponse('attendance summary top-level invalid');
  if (
    typeof data.enrollmentId !== 'string' ||
    typeof data.numerator !== 'number' ||
    typeof data.denominator !== 'number' ||
    typeof data.minimumRatio !== 'string' ||
    typeof data.meetsPolicy !== 'boolean' ||
    !isObj(data.statusCounts)
  ) {
    invalidResponse('attendance summary fields invalid');
  }
  return data as unknown as EnrollmentAttendanceSummary;
}
export function validateFinanceSummary(data: unknown): EnrollmentFinanceSummary {
  if (!isObj(data)) invalidResponse('finance summary top-level invalid');
  if (
    typeof data.billingAccountId !== 'string' ||
    typeof data.currencyCode !== 'string' ||
    typeof data.totalDebits !== 'string' ||
    typeof data.totalCredits !== 'string' ||
    typeof data.balance !== 'string' ||
    typeof data.outstandingDebits !== 'string' ||
    typeof data.unappliedCredits !== 'string'
  ) {
    invalidResponse('finance summary fields invalid');
  }
  return data as unknown as EnrollmentFinanceSummary;
}
export function validateStudentCertificatesPage(data: unknown): StudentCertificatesPage {
  if (
    !isObj(data) ||
    !Array.isArray(data.items) ||
    (data.nextCursor !== null && typeof data.nextCursor !== 'string')
  ) {
    invalidResponse('certificates page structure invalid');
  }
  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.serial !== 'string' ||
      typeof item.enrollmentId !== 'string' ||
      typeof item.validityStatus !== 'string' ||
      typeof item.issuedAt !== 'string' ||
      (item.pdfStatus !== 'PENDING_UPLOAD' && item.pdfStatus !== 'AVAILABLE') ||
      (item.fulfillmentStatus !== undefined && typeof item.fulfillmentStatus !== 'string') ||
      (item.version !== undefined && typeof item.version !== 'number') ||
      (item.student !== undefined && item.student !== null && !isObj(item.student))
    ) {
      invalidResponse('certificate item invalid');
    }
  }
  return data as unknown as StudentCertificatesPage;
}
export function validateStudentEnrollment(data: unknown): StudentEnrollment {
  const page = validateStudentEnrollmentsPage({ items: [data], nextCursor: null });
  const enrollment = page.items[0];
  if (!enrollment) invalidResponse('student enrollment missing');
  return enrollment;
}
