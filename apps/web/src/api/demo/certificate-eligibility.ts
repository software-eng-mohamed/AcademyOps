import { enrollmentFinance } from './finance-fixtures';
import {
  baseRecord,
  cents,
  type DemoRecord,
  type DemoState,
  failure,
  ownerId,
  records,
  string,
  timestamp,
} from './shared';

export function certificateEligibility(state: DemoState, enrollment: DemoRecord) {
  const now = Date.now();
  const rule = records(state, 'certificateRules')
    .filter(
      (item) =>
        item.programVersionId === enrollment.programVersionId &&
        (!item.cohortId || item.cohortId === enrollment.cohortId) &&
        Date.parse(string(item.effectiveFrom)) <= now &&
        (!item.effectiveTo || Date.parse(string(item.effectiveTo)) > now),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.cohortId)) - Number(Boolean(a.cohortId)) ||
        Date.parse(string(b.effectiveFrom)) - Date.parse(string(a.effectiveFrom)),
    )[0];
  if (!rule) return null;
  const attendance = records(state, 'attendance').filter(
    (item) => item.enrollmentId === enrollment.id,
  );
  const counted = attendance.filter(
    (item) => !['UNMARKED', 'EXCUSED'].includes(string(item.effectiveStatus ?? item.status)),
  );
  const attended = counted.filter((item) =>
    ['PRESENT', 'LATE'].includes(string(item.effectiveStatus ?? item.status)),
  );
  const ratio = counted.length ? attended.length / counted.length : null;
  const minimumRatio = Math.max(0.8, Number(rule.minimumRatio));
  const outstanding = enrollmentFinance(state, enrollment).outstandingDebits;
  const financialHold = (cents(outstanding) ?? 0) > 0;
  const academicEligibility = ratio !== null && ratio >= minimumRatio ? 'ELIGIBLE' : 'INELIGIBLE';
  return {
    view: {
      attendanceRatio: ratio === null ? null : ratio.toFixed(4),
      minimumRatio: minimumRatio.toFixed(4),
      academicEligibility,
      financialHold,
      outstanding,
      completionSatisfied: enrollment.state === 'COMPLETED',
      overallEligibility: academicEligibility === 'ELIGIBLE' && !financialHold,
      ruleId: rule.id,
    },
    numerator: attended.length,
    denominator: counted.length,
  };
}

export type CertificateSnapshot = NonNullable<ReturnType<typeof certificateEligibility>>;

export function certificateIssueError(snapshot: CertificateSnapshot | null): Response | null {
  if (!snapshot) return failure('CERTIFICATE_RULE_MISSING', 409, 'certificates.ruleMissing');
  if (snapshot.view.academicEligibility !== 'ELIGIBLE')
    return failure('CERTIFICATE_ACADEMIC_INELIGIBLE', 409, 'certificates.academicIneligible');
  if (snapshot.view.financialHold)
    return failure('CERTIFICATE_FINANCIAL_HOLD', 409, 'certificates.financialHold');
  return null;
}

export function certificateEvaluation(
  enrollmentId: string,
  id: string,
  snapshot: CertificateSnapshot,
) {
  const { view, numerator, denominator } = snapshot;
  return baseRecord(id, {
    enrollmentId,
    ruleVersionId: view.ruleId,
    attendanceRatio: view.attendanceRatio,
    academicResult: view.academicEligibility,
    financialHold: view.financialHold,
    minimumRatio: view.minimumRatio,
    outstanding: view.outstanding,
    completionSatisfied: view.completionSatisfied,
    evaluatedAt: timestamp(),
    evaluatedBy: ownerId,
    createdAt: timestamp(),
    evidenceSnapshot: {
      synthetic: true,
      numerator,
      denominator,
      minimumRatio: view.minimumRatio,
      outstanding: view.outstanding,
      completionSatisfied: view.completionSatisfied,
      ruleVersionId: view.ruleId,
    },
  });
}
