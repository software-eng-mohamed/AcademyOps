'use client';

import { isPlgApiError } from '@academyops/api-client/http';
import { Badge } from '@academyops/ui/registry';
import { Warning2 } from 'iconsax-react';
import { Button } from '@/components/base/buttons/button';
import { type AcademyCopy, academyLabel } from '@/i18n/academy-copy';
import type { Locale } from '@/lib/locales';
import styles from './academy-styles';

export function StatusPill({ status, copy }: { status: string; copy: AcademyCopy }) {
  return (
    <DirectoryStatus status={status} label={status ? academyLabel(copy, status) : copy.none} />
  );
}

export function DirectoryStatus({ status, label }: { status: string; label: string }) {
  const tone = [
    'ACTIVE',
    'APPROVED',
    'PUBLISHED',
    'WON',
    'COMPLETED',
    'POSTED',
    'VALID',
    'PRESENT',
    'COLLECTED',
    'AVAILABLE',
    'READY',
    'READY_TO_START',
    'PAID',
  ].includes(status)
    ? 'success'
    : [
          'PENDING',
          'PLANNED',
          'COLLECTING',
          'TARGET_REQUIRED',
          'PENDING_APPROVAL',
          'POSTPONED',
          'OPEN',
          'QUALIFIED',
          'REQUESTED',
          'SCHEDULED',
          'PENDING_VERIFICATION',
          'LATE',
          'QUEUED',
          'RUNNING',
          'ISSUED',
        ].includes(status)
      ? 'warning'
      : [
            'REJECTED',
            'LOST',
            'CANCELLED',
            'DISQUALIFIED',
            'ABSENT',
            'REVOKED',
            'VOIDED',
            'FAILED',
            'EXPIRED',
          ].includes(status)
        ? 'danger'
        : 'neutral';
  return (
    <Badge
      variant="outline"
      className={
        tone === 'success'
          ? 'border-success/20 bg-success-soft text-success'
          : tone === 'warning'
            ? 'border-warning/20 bg-warning-soft text-warning'
            : tone === 'danger'
              ? 'border-danger/20 bg-danger-soft text-danger'
              : 'border-border bg-surface-subtle text-ink-muted'
      }
    >
      {label}
    </Badge>
  );
}

export function ErrorNotice({
  error,
  copy,
  retry,
}: {
  error: unknown;
  copy: AcademyCopy;
  retry?: () => void;
}) {
  const apiError = isPlgApiError(error) ? error : undefined;
  const domainMessages: Record<string, string> = {
    PAYMENT_ADJUSTMENT_CONFLICT: copy.paymentAdjustmentConflict,
    PAYMENT_ADJUSTMENT_ALLOCATION_CONFLICT: copy.paymentAllocationConflict,
    FINANCE_ALLOCATION_RECONCILIATION_REQUIRED: copy.financeReconciliationRequired,
    FINANCIAL_REQUEST_ALREADY_DECIDED: copy.financialRequestAlreadyDecided,
    REQUEST_WITHDRAW_REQUESTER_REQUIRED: copy.financialRequestRequesterRequired,
    FINANCIAL_REASON_INVALID: copy.financialReasonInvalid,
    MAKER_CHECKER_REQUIRED: copy.financialCheckerRequired,
    ENROLLMENT_PRICING_LOCKED: copy.enrollmentPricingLocked,
    PRICING_STATE_OR_VERSION_CONFLICT: copy.pricingVersionConflict,
    INSTALLMENT_SCHEDULE_STATE_OR_VERSION_CONFLICT: copy.pricingVersionConflict,
    ATTENDANCE_RESOURCE_NOT_FOUND: copy.attendanceUnavailable,
    ATTENDANCE_CORRECTION_DENIED: copy.attendanceLocked,
    ATTENDANCE_WINDOW_NOT_OPEN: copy.attendanceWindowClosed,
    MANUAL_ATTENDANCE_WINDOW_INVALID: copy.attendanceWindowClosed,
    ATTENDANCE_ALREADY_RECORDED: copy.attendanceAlreadyRecorded,
    ATTENDANCE_RECORDED: copy.attendanceAlreadyRecorded,
    INVALID_STUDENT_QR_TOKEN: copy.attendanceInvalidQr,
    QR_INVALID_OR_EXPIRED: copy.attendanceSessionQrInvalid,
    NOT_IN_SESSION_ROSTER: copy.attendanceNotInRoster,
    EXTERNAL_REFERENCE_REQUIRED: copy.paymentReferenceRequired,
    PAYMENT_REFERENCE_DUPLICATE: copy.paymentReferenceDuplicate,
    PAYMOB_NOT_CONFIGURED: copy.checkoutUnavailable,
    PAYMOB_CUSTOMER_CONTACT_REQUIRED: copy.checkoutContactRequired,
    PAYMOB_INSTALLMENT_ATTEMPT_ACTIVE: copy.checkoutReconciliation,
    PAYMOB_ATTEMPT_REQUIRES_RECONCILIATION: copy.checkoutReconciliation,
    PAYMOB_ATTEMPT_NOT_REPLAYABLE: copy.checkoutReconciliation,
    INSTALLMENT_ALREADY_PAID: copy.checkoutAlreadyPaid,
    INSTALLMENT_NOT_ACTIVATED: copy.checkoutNotActivated,
    BUSINESS_ACCOUNT_ARCHIVED: copy.companyArchived,
    BUSINESS_ACCOUNT_ACTIVE_ENROLLMENTS: copy.companyActiveEnrollments,
    CERTIFICATE_RULE_MISSING: copy.certificateRuleMissing,
    COHORT_DATES_REQUIRED: copy.cohortDatesRequired,
    COHORT_TARGET_REQUIRED: copy.cohortTargetRequired,
    COHORT_NOT_STARTED: copy.cohortNotStarted,
    COHORT_INTAKE_INCOMPLETE: copy.cohortIntakeIncomplete,
    COHORT_CAPACITY_BELOW_RESERVED: copy.cohortCapacityBelowReserved,
    COHORT_CAPACITY_REACHED: copy.cohortCapacityReached,
    COHORT_SESSIONS_REQUIRED: copy.cohortSessionsRequired,
    SCHEDULE_CONFLICT: copy.scheduleConflict,
    SESSION_NOT_FINISHED: copy.sessionNotFinished,
    ATTENDANCE_CHECK_IN_PERIOD_CLOSED: copy.attendancePeriodClosed,
    SCHEDULE_NOT_APPROVED: copy.scheduleNotApproved,
    PRICING_NOT_APPROVED: copy.pricingNotApproved,
    COHORT_REQUIRED: copy.cohortRequired,
    COHORT_ENROLLMENT_INVALID: copy.cohortInvalid,
    INSTALLMENTS_REQUIRED: copy.installmentsRequired,
    ENROLLMENT_TRANSITION_INVALID: copy.transitionInvalid,
  };
  const domainMessage = apiError?.payload.code ? domainMessages[apiError.payload.code] : undefined;
  const message =
    domainMessage ??
    (apiError?.payload.code === 'MFA_STEP_UP_REQUIRED'
      ? copy.stepUpRequired
      : apiError?.status === 403
        ? copy.forbidden
        : apiError?.status === 409 || apiError?.status === 412
          ? copy.conflict
          : apiError?.status === 429
            ? copy.rateLimit
            : apiError?.status === 400 || apiError?.status === 422
              ? copy.requestRejected
              : copy.error);
  return (
    <div className={styles.error} role="alert">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400 ring-1 ring-red-500/20">
        <Warning2 aria-hidden color="currentColor" size={20} variant="Bulk" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-semibold leading-relaxed text-text-primary">{message}</p>
        {apiError?.correlationId ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-secondary bg-background-primary-default px-2.5 py-1 text-[11px] font-mono text-text-secondary shadow-2xs">
              <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
              <span>{copy.tracking}:</span>
              <bdi dir="ltr" className="select-all font-semibold tracking-wider text-text-primary">
                {apiError.correlationId}
              </bdi>
            </span>
          </div>
        ) : null}
      </div>
      {retry ? (
        <Button
          type="button"
          variant="secondary"
          size="small"
          className="shrink-0 self-center"
          onClick={retry}
        >
          {copy.retry}
        </Button>
      ) : null}
    </div>
  );
}

export function formatAcademyDate(value: unknown, locale: Locale, none: string) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return none;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Cairo' }).format(
    new Date(value),
  );
}
export function formatAcademyDateTime(value: unknown, locale: Locale, none: string) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return none;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}
