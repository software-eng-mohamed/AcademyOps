import { personFor } from './academy-relations';
import { addEvent, addStudent, insert, saved } from './academy-write';
import {
  branchId,
  bump,
  type DemoContext,
  type DemoRecord,
  failure,
  find,
  invalid,
  ownerId,
  records,
  required,
  string,
  timestamp,
  versionConflict,
} from './shared';

function createEnrollment(context: DemoContext, personId: unknown): DemoRecord | Response {
  const { state, body } = context;
  const person = personFor(state, personId);
  const cohort = find(state, 'cohorts', body.cohortId);
  if (
    !person ||
    !cohort ||
    !['PLANNED', 'ACTIVE'].includes(string(cohort.status)) ||
    body.programVersionId !== cohort.programVersionId ||
    body.homeBranchId !== branchId ||
    !['INDIVIDUAL', 'CORPORATE'].includes(string(body.kind))
  )
    return invalid();
  if (
    records(state, 'enrollments').some(
      (item) =>
        item.studentPersonId === person.id &&
        item.cohortId === cohort.id &&
        item.state !== 'CANCELLED',
    )
  )
    return failure('ENROLLMENT_ALREADY_EXISTS', 409);
  if (
    records(state, 'enrollments').filter(
      (item) => item.cohortId === cohort.id && item.state !== 'CANCELLED',
    ).length >= Number(cohort.capacity ?? 1000)
  )
    return failure('COHORT_CAPACITY_EXCEEDED', 409);
  let account = find(state, 'billingAccounts', body.billingAccountId);
  if (body.kind === 'CORPORATE' && !account) return invalid();
  if (!find(state, 'students', person.id)) addStudent(state, { ...person, branchId }, person.id);
  account ??= records(state, 'billingAccounts').find(
    (item) => item.ownerPersonId === person.id || item.studentPersonId === person.id,
  );
  account ??= insert(state, 'billingAccounts', {
    name: person.name,
    displayName: person.name,
    ownerPersonId: person.id,
    studentPersonId: person.id,
    kind: 'INDIVIDUAL',
    type: 'INDIVIDUAL',
    currencyCode: 'EGP',
    status: 'ACTIVE',
    balance: '0.00',
  });
  return insert(state, 'enrollments', {
    studentPersonId: person.id,
    programVersionId: cohort.programVersionId,
    cohortId: cohort.id,
    billingAccountId: account.id,
    homeBranchId: branchId,
    kind: body.kind,
    state: 'DRAFT',
    activatedAt: null,
    completedAt: null,
    cancelledAt: null,
  });
}
function requestDecision(context: DemoContext): Response | null {
  const { path, method, state, body } = context;
  const [noun, id, action] = path;
  const collection =
    noun === 'module-retakes'
      ? 'moduleRetakes'
      : noun === 'enrollment-cancellation-requests'
        ? 'enrollmentCancellationRequests'
        : null;
  if (
    !collection ||
    path.length !== 3 ||
    method !== 'POST' ||
    !['approve', 'reject'].includes(action ?? '')
  )
    return null;
  const item = find(state, collection, id);
  const enrollment = find(state, 'enrollments', item?.enrollmentId);
  if (!item || !enrollment || !required(body.reason, 1000)) return invalid();
  const conflict = versionConflict(context, item);
  if (conflict) return conflict;
  if (item.status !== 'REQUESTED') return failure('INVALID_STATE_TRANSITION', 409);
  bump(item, {
    status: action === 'approve' ? 'APPROVED' : 'REJECTED',
    decidedBy: ownerId,
    decidedAt: timestamp(),
    decisionReason: body.reason,
  });
  if (action === 'approve' && collection === 'enrollmentCancellationRequests') {
    addEvent(
      state,
      'enrollmentEvents',
      'enrollmentId',
      enrollment,
      enrollment.state,
      'CANCELLED',
      body.reason,
    );
    bump(enrollment, { state: 'CANCELLED', cancelledAt: timestamp() });
  }
  return saved(context, collection, item, string(action).toUpperCase());
}
export function handleEnrollmentRoute(context: DemoContext): Response | null {
  const decision = requestDecision(context);
  if (decision) return decision;
  const { path, method, body, state } = context;
  if (path[0] === 'leads' && path.length === 3 && path[2] === 'win' && method === 'POST') {
    const lead = find(state, 'leads', path[1]);
    if (!lead) return null;
    const conflict = versionConflict(context, lead);
    if (conflict) return conflict;
    if (lead.state !== 'QUALIFIED') return failure('INVALID_STATE_TRANSITION', 409);
    const enrollment = createEnrollment(context, lead.personId);
    if (enrollment instanceof Response) return enrollment;
    addEvent(state, 'leadHistory', 'leadId', lead, lead.state, 'WON', body.reason);
    bump(lead, { state: 'WON', enrollmentId: enrollment.id });
    return saved(context, 'enrollments', enrollment, 'LEAD_CONVERTED', 201);
  }
  if (path[0] !== 'enrollments' || method !== 'POST') return null;
  if (path.length === 1) {
    const item = createEnrollment(context, body.studentPersonId);
    return item instanceof Response ? item : saved(context, 'enrollments', item, 'CREATE', 201);
  }
  if (path.length !== 3) return null;
  const item = find(state, 'enrollments', path[1]);
  if (!item) return null;
  const conflict = versionConflict(context, item);
  if (conflict) return conflict;
  const action = path[2] ?? '';
  if (action === 'transfer') {
    const target = find(state, 'cohorts', body.targetCohortId);
    if (
      !target ||
      target.id === item.cohortId ||
      target.programVersionId !== item.programVersionId ||
      !['PLANNED', 'ACTIVE'].includes(string(target.status)) ||
      !['ACTIVE', 'POSTPONED'].includes(string(item.state)) ||
      !required(body.reason, 1000)
    )
      return invalid();
    if (
      records(state, 'enrollments').filter(
        (entry) => entry.cohortId === target.id && entry.state !== 'CANCELLED',
      ).length >= Number(target.capacity ?? 1000)
    )
      return failure('COHORT_CAPACITY_EXCEEDED', 409);
    return saved(context, 'enrollments', bump(item, { cohortId: target.id }), 'TRANSFER');
  }
  if (action === 'cancellation-requests' || action === 'retakes') {
    if (!required(body.reason, 1000)) return invalid();
    if (action === 'cancellation-requests' && !['ACTIVE', 'POSTPONED'].includes(string(item.state)))
      return failure('INVALID_STATE_TRANSITION', 409);
    if (action === 'retakes') {
      const module = find(state, 'programVersionModules', body.programVersionModuleId);
      const target = body.targetCohortModuleId
        ? find(state, 'cohortModules', body.targetCohortModuleId)
        : null;
      if (
        !['ACTIVE', 'POSTPONED', 'COMPLETED'].includes(string(item.state)) ||
        module?.programVersionId !== item.programVersionId ||
        (body.targetCohortModuleId && target?.programVersionModuleId !== module?.id)
      )
        return invalid();
    }
    const collection = action === 'retakes' ? 'moduleRetakes' : 'enrollmentCancellationRequests';
    if (
      records(state, collection).some(
        (entry) => entry.enrollmentId === item.id && entry.status === 'REQUESTED',
      )
    )
      return failure('REQUEST_ALREADY_PENDING', 409);
    const request = insert(state, collection, {
      enrollmentId: item.id,
      enrollmentVersion: item.version,
      reason: body.reason,
      status: 'REQUESTED',
      requestedBy: ownerId,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      ...(action === 'retakes'
        ? {
            programVersionModuleId: body.programVersionModuleId,
            targetCohortModuleId: body.targetCohortModuleId ?? null,
          }
        : {}),
    });
    return saved(context, collection, request, 'REQUEST', 201);
  }
  const transitions: Record<string, { from: string[]; to: string }> = {
    submit: { from: ['DRAFT'], to: 'PENDING_APPROVAL' },
    activate: { from: ['DRAFT', 'PENDING_APPROVAL'], to: 'ACTIVE' },
    reject: { from: ['PENDING_APPROVAL'], to: 'DRAFT' },
    postpone: { from: ['ACTIVE'], to: 'POSTPONED' },
    resume: { from: ['POSTPONED'], to: 'ACTIVE' },
    complete: { from: ['ACTIVE', 'POSTPONED'], to: 'COMPLETED' },
  };
  const transition = transitions[action];
  if (!transition) return null;
  if (!transition.from.includes(string(item.state)))
    return failure('INVALID_STATE_TRANSITION', 409);
  if (!['submit', 'activate'].includes(action) && !required(body.reason, 1000)) return invalid();
  addEvent(state, 'enrollmentEvents', 'enrollmentId', item, item.state, transition.to, body.reason);
  bump(item, {
    state: transition.to,
    ...(action === 'activate' ? { activatedAt: timestamp() } : {}),
    ...(action === 'complete' ? { completedAt: timestamp() } : {}),
  });
  return saved(context, 'enrollments', item, action.toUpperCase());
}
