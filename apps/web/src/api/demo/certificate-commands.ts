import {
  certificateEligibility,
  certificateEvaluation,
  certificateIssueError,
} from './certificate-eligibility';
import {
  audit,
  baseRecord,
  type DemoContext,
  type DemoRecord,
  type DemoState,
  failure,
  find,
  invalid,
  json,
  nextId,
  notFound,
  ownerId,
  records,
  required,
  timestamp,
} from './shared';

export function certificateEvent(
  state: DemoState,
  item: DemoRecord,
  type: string,
  fromValue: unknown,
  toValue: string,
  reason: unknown = null,
) {
  const event = baseRecord(nextId(state), {
    certificateId: item.id,
    type,
    fromValue: fromValue ?? null,
    toValue,
    reason,
    actorUserId: ownerId,
    occurredAt: timestamp(),
  });
  item.events = [...(Array.isArray(item.events) ? item.events : []), event];
}

export function certificateRecord(
  state: DemoState,
  enrollment: DemoRecord,
  evaluation: DemoRecord,
  id: string,
  serial: string,
  supersedesId: string | null = null,
) {
  const student = find(state, 'students', enrollment.studentPersonId);
  const version = find(state, 'programVersions', enrollment.programVersionId);
  const program = find(state, 'programs', version?.programId);
  return baseRecord(id, {
    enrollmentId: enrollment.id,
    evaluationId: evaluation.id,
    evaluation,
    student: { id: student?.id, name: student?.name, publicId: student?.publicId },
    program: { id: program?.id, name: program?.name, code: program?.code },
    verificationToken: `synthetic-demo-${id}`,
    serial,
    supersedesId,
    validityStatus: 'ISSUED',
    fulfillmentStatus: 'NOT_PRINTED',
    pdfStatus: 'AVAILABLE',
    fileAssetId: id,
    issuedBy: ownerId,
    issuedAt: timestamp(),
    createdAt: timestamp(),
    revokedBy: null,
    revokedAt: null,
    revocationReason: null,
    events: [],
  });
}

export function handleCertificateCommand(ctx: DemoContext): Response | null {
  const { state, path, method, body } = ctx;
  if (method !== 'POST' || path[0] !== 'certificates') return null;
  const reissue = path.length === 3 && path[2] === 'reissue';
  const action = path.length === 2 ? path[1] : reissue ? 'reissue' : '';
  if (!['evaluate', 'issue', 'reissue'].includes(action ?? '')) return null;
  const previous = reissue ? find(state, 'certificates', path[1]) : undefined;
  if (reissue && !previous) return notFound();
  if (reissue && !required(body.reason, 1000)) return invalid();
  if (previous && previous.validityStatus !== 'REVOKED')
    return failure('CERTIFICATE_REISSUE_INVALID', 409);
  const enrollment = find(state, 'enrollments', previous?.enrollmentId ?? body.enrollmentId);
  if (!enrollment) return notFound();
  const certificates = records(state, 'certificates').filter(
    (item) => item.enrollmentId === enrollment.id,
  );
  if (action !== 'evaluate') {
    const active = certificates.find((item) => item.validityStatus === 'ISSUED');
    if (active) return reissue ? failure('CERTIFICATE_ALREADY_ACTIVE', 409) : json(active);
    if (!reissue && certificates.some((item) => item.validityStatus === 'REVOKED'))
      return failure('CERTIFICATE_REISSUE_REQUIRED', 409);
  }
  const snapshot = certificateEligibility(state, enrollment);
  if (!snapshot) return failure('CERTIFICATE_RULE_MISSING', 409, 'certificates.ruleMissing');
  if (action !== 'evaluate') {
    const denial = certificateIssueError(snapshot);
    if (denial) return denial;
  }
  const evaluation = certificateEvaluation(enrollment.id, nextId(state), snapshot);
  state.collections.certificateEvaluations ??= [];
  state.collections.certificateEvaluations.unshift(evaluation);
  if (action === 'evaluate') {
    audit(state, 'certificate.evaluate', evaluation, 'ELIGIBILITY_EVALUATION');
    return json(evaluation, 201);
  }
  const id = nextId(state);
  const certificate = certificateRecord(
    state,
    enrollment,
    evaluation,
    id,
    `DEMO-CERT-${String(1001 + records(state, 'certificates').length)}`,
    previous?.id ?? null,
  );
  certificateEvent(
    state,
    certificate,
    reissue ? 'REISSUED' : 'ISSUED',
    null,
    'ISSUED',
    body.reason ?? null,
  );
  state.collections.certificates ??= [];
  state.collections.certificates.push(certificate);
  audit(state, `certificate.${action}`, certificate, 'CERTIFICATE');
  return json(certificate, 201);
}
