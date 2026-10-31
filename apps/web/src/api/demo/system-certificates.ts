import { certificateEvent, handleCertificateCommand } from './certificate-commands';
import { certificateEligibility, certificateIssueError } from './certificate-eligibility';
import { demoCertificatePdf } from './demo-pdf';
import {
  audit,
  bump,
  type DemoContext,
  failure,
  find,
  invalid,
  json,
  notFound,
  object,
  ownerId,
  page,
  records,
  required,
  string,
  timestamp,
  unsupported,
  versionConflict,
} from './shared';

export function handleCertificateRoute(ctx: DemoContext): Response | null {
  const { path, state, method, body, url } = ctx;
  if (path[0] === 'certificate-rules' && method === 'GET')
    return page(records(state, 'certificateRules'), url);
  if (path[0] !== 'certificates') return null;
  const command = handleCertificateCommand(ctx);
  if (command) return command;
  if (method === 'GET' && path.length === 1) {
    const status = url.searchParams.get('validityStatus');
    return page(
      records(state, 'certificates').filter((item) => !status || item.validityStatus === status),
      url,
    );
  }
  if (method === 'GET' && path[1] === 'enrollments' && path.length === 4) {
    const enrollment = find(state, 'enrollments', path[2]);
    if (!enrollment) return notFound();
    if (path[3] === 'evaluations')
      return json({
        items: records(state, 'certificateEvaluations')
          .filter((item) => item.enrollmentId === enrollment.id)
          .slice(0, 100),
      });
    if (path[3] === 'eligibility') {
      const snapshot = certificateEligibility(state, enrollment);
      return snapshot
        ? json(snapshot.view)
        : failure('CERTIFICATE_RULE_MISSING', 409, 'certificates.ruleMissing');
    }
    return notFound();
  }
  const item =
    path[1] === 'verify'
      ? records(state, 'certificates').find((row) => row.verificationToken === path[2])
      : find(state, 'certificates', path[1]);
  if (!item) return method === 'GET' ? notFound() : unsupported();
  if (method === 'GET' && path[1] === 'verify' && path.length === 3)
    return json({
      name: object(item.student).name,
      programAr: object(item.program).name,
      programEn: object(item.program).name,
      serial: item.serial,
      issuedAt: item.issuedAt,
      validityStatus: item.validityStatus,
    });
  if (method === 'GET' && path.length === 2) return json(item);
  if (method === 'GET' && path.length === 3 && ['download', 'file'].includes(path[2] ?? '')) {
    if (item.validityStatus !== 'ISSUED') return failure('CERTIFICATE_NOT_ACTIVE', 409);
    if (item.pdfStatus !== 'AVAILABLE') return failure('CERTIFICATE_PDF_NOT_AVAILABLE', 409);
    const enrollment = find(state, 'enrollments', item.enrollmentId);
    if (!enrollment) return notFound();
    const denial = certificateIssueError(certificateEligibility(state, enrollment));
    if (denial) return denial;
    if (path[2] === 'download')
      return json({
        url: `${url.origin}/api/v1/certificates/${item.id}/file`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
    const pdf = demoCertificatePdf(string(item.serial), string(object(item.student).name));
    return new Response(new Uint8Array(pdf).buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${string(item.serial)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  if (method !== 'POST' || path.length !== 3) return unsupported();
  const conflict = versionConflict(ctx, item);
  if (conflict) return conflict;
  if (path[2] === 'revoke') {
    if (!required(body.reason, 1000)) return invalid();
    if (item.validityStatus === 'REVOKED') return json(item);
    if (item.validityStatus !== 'ISSUED') return failure('CERTIFICATE_NOT_ACTIVE', 409);
    certificateEvent(state, item, 'REVOKED', item.validityStatus, 'REVOKED', body.reason);
    bump(item, {
      validityStatus: 'REVOKED',
      revokedAt: timestamp(),
      revokedBy: ownerId,
      revocationReason: body.reason,
    });
  } else {
    const transitions: Record<string, [string, string]> = {
      print: ['NOT_PRINTED', 'PRINTED'],
      ready: ['PRINTED', 'READY_FOR_COLLECTION'],
      collect: ['READY_FOR_COLLECTION', 'COLLECTED'],
    };
    const transition = transitions[path[2] ?? ''];
    if (!transition) return unsupported();
    if (item.validityStatus !== 'ISSUED') return failure('CERTIFICATE_NOT_ACTIVE', 409);
    if (path[2] === 'print' && item.pdfStatus !== 'AVAILABLE')
      return failure('CERTIFICATE_PDF_NOT_AVAILABLE', 409);
    if (item.fulfillmentStatus !== transition[0])
      return failure('CERTIFICATE_FULFILLMENT_INVALID', 409);
    const enrollment = find(state, 'enrollments', item.enrollmentId);
    if (!enrollment) return notFound();
    const denial = certificateIssueError(certificateEligibility(state, enrollment));
    if (denial) return denial;
    certificateEvent(state, item, 'FULFILLMENT_CHANGED', item.fulfillmentStatus, transition[1]);
    bump(item, { fulfillmentStatus: transition[1] });
  }
  audit(state, `certificate.${path[2]}`, item, 'CERTIFICATE');
  return json(item, 201);
}
