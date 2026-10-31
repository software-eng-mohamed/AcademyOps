import { enrollmentFinance } from './finance-fixtures';
import { branchId, type DemoRecord, type DemoState, find, object, records, string } from './shared';

export function personFor(state: DemoState, id: unknown) {
  return find(state, 'students', id) ?? find(state, 'people', id);
}
function curriculum(state: DemoState, collection: string, key: string, id: string) {
  return records(state, collection)
    .filter((item) => item[key] === id)
    .map((item) => ({ ...item, module: find(state, 'modules', item.moduleId) ?? null }));
}
export function enrollmentView(state: DemoState, item: DemoRecord): DemoRecord {
  const version = find(state, 'programVersions', item.programVersionId);
  const program = find(state, 'programs', version?.programId);
  const cohort = find(state, 'cohorts', item.cohortId);
  const payments = records(state, 'payments').filter(
    (payment) => payment.enrollmentId === item.id && payment.status === 'POSTED',
  );
  const finance = enrollmentFinance(state, item);
  const fee = records(state, 'feeAgreements').find(
    (agreement) => agreement.enrollmentId === item.id && agreement.status === 'APPROVED',
  );
  return {
    ...item,
    student: personFor(state, item.studentPersonId) ?? null,
    program: program ?? null,
    programVersion: version ?? null,
    cohort: cohort ?? null,
    branch: { id: branchId, code: 'MAIN', name: 'Main Branch' },
    activeCohortAssignment: cohort
      ? {
          id: item.id,
          cohortId: cohort.id,
          cohort,
          assignedAt: item.activatedAt ?? item.createdAt,
          endedAt: null,
        }
      : null,
    assignments: cohort
      ? [{ id: item.id, cohortId: cohort.id, cohort, assignedAt: item.createdAt, endedAt: null }]
      : [],
    events: records(state, 'enrollmentEvents').filter((event) => event.enrollmentId === item.id),
    retakes: records(state, 'moduleRetakes').filter((entry) => entry.enrollmentId === item.id),
    cancellationRequests: records(state, 'enrollmentCancellationRequests').filter(
      (entry) => entry.enrollmentId === item.id,
    ),
    finance: {
      ...finance,
      totalAmount: Number(finance.totalDebits),
      paidAmount: Number(finance.totalCredits),
      outstandingBalance: Number(finance.outstandingDebits),
      paymentCount: payments.length,
      subtotal: Number(fee?.subtotal ?? finance.totalDebits),
      discountAmount: Number(fee?.discountAmount ?? 0),
    },
    source: { kind: 'CURRENT', label: 'Synthetic demo' },
  };
}
export function academyView(state: DemoState, collection: string, item: DemoRecord): DemoRecord {
  if (collection === 'students') {
    const enrollments = records(state, 'enrollments')
      .filter((enrollment) => enrollment.studentPersonId === item.id)
      .map((enrollment) => enrollmentView(state, enrollment));
    const latest = enrollments[0];
    return {
      ...item,
      possibleDuplicates: [],
      enrollments,
      enrollmentSummary: {
        total: enrollments.length,
        active: enrollments.filter((entry) => entry.state === 'ACTIVE').length,
        latestState: latest?.state ?? null,
        program: latest?.program ?? null,
        cohort: latest?.cohort ?? null,
        branch: latest?.branch ?? null,
      },
    };
  }
  if (collection === 'leads') {
    const person = personFor(state, item.personId);
    return {
      ...item,
      person: person ?? null,
      contacts: person?.contacts ?? [],
      stage: find(state, 'leadStages', item.stageId) ?? null,
      activities: records(state, 'leadActivities').filter((entry) => entry.leadId === item.id),
      history: records(state, 'leadHistory').filter((entry) => entry.leadId === item.id),
    };
  }
  if (collection === 'programs')
    return {
      ...item,
      versions: records(state, 'programVersions').filter((entry) => entry.programId === item.id),
    };
  if (collection === 'programVersions')
    return {
      ...item,
      modules: curriculum(state, 'programVersionModules', 'programVersionId', item.id),
    };
  if (collection === 'cohorts') {
    const enrollments = records(state, 'enrollments').filter(
      (entry) => entry.cohortId === item.id && entry.state !== 'CANCELLED',
    );
    const confirmed = enrollments.filter((entry) => entry.state === 'ACTIVE').length;
    const version = find(state, 'programVersions', item.programVersionId);
    return {
      ...item,
      modules: curriculum(state, 'cohortModules', 'cohortId', item.id),
      program: find(state, 'programs', version?.programId) ?? null,
      programVersion: version ?? null,
      learnerCount: enrollments.length,
      confirmedEnrollmentCount: confirmed,
      pendingEnrollmentCount: enrollments.filter((entry) =>
        ['DRAFT', 'PENDING_APPROVAL'].includes(string(entry.state)),
      ).length,
      postponedEnrollmentCount: enrollments.filter((entry) => entry.state === 'POSTPONED').length,
      reservedEnrollmentCount: enrollments.length,
      remainingEnrollmentCount: Math.max(0, Number(item.capacity ?? 0) - confirmed),
      intakeStatus:
        item.status === 'PLANNED'
          ? confirmed >= Number(item.capacity)
            ? 'READY_TO_START'
            : 'COLLECTING'
          : item.status,
    };
  }
  if (collection === 'enrollments') return enrollmentView(state, item);
  if (collection === 'studentRegistrations')
    return { ...item, person: personFor(state, item.personId) ?? null };
  if (collection === 'trainers') return { ...item, name: item.name ?? object(item.person).name };
  return item;
}
