import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type RouteEvidence = {
  key: string;
  terminal: 'SUCCESS' | 'UNAVAILABLE_BY_DESIGN';
  expectedStatus?: number;
  expectedCode?: string;
};

export type ReleaseRouteEvidence = RouteEvidence & {
  source:
    | 'baseline-identity-platform'
    | 'business-chain'
    | 'domain'
    | 'finance-paymob'
    | 'imports'
    | 'phase5-iam'
    | 'phase5-learning'
    | 'phase5-platform';
};

const success = (key: string): RouteEvidence => ({ key, terminal: 'SUCCESS' });
export const phase5RouteEvidence: RouteEvidence[] = [
  ...[
    'POST /api/v1/auth/password/change',
    'POST /api/v1/auth/password/reset/request',
    'POST /api/v1/auth/password/reset/complete',
    'POST /api/v1/auth/mfa/totp/enroll',
    'POST /api/v1/auth/mfa/totp/{factorId}/verify',
    'POST /api/v1/auth/mfa/step-up',
    'POST /api/v1/auth/mfa/recovery-codes/regenerate',
    'GET /api/v1/branches',
    'POST /api/v1/branches',
    'GET /api/v1/branches/{id}',
    'PATCH /api/v1/branches/{id}',
    'GET /api/v1/roles',
    'POST /api/v1/roles',
    'GET /api/v1/roles/{id}',
    'PATCH /api/v1/roles/{id}',
    'PUT /api/v1/roles/{id}/grants',
    'GET /api/v1/users',
    'POST /api/v1/users',
    'GET /api/v1/users/{id}',
    'PATCH /api/v1/users/{id}/status',
    'PUT /api/v1/users/{id}/roles',
    'PUT /api/v1/users/{id}/branches',
    'GET /api/v1/files/{id}/content',
    'POST /api/v1/realtime/ticket',
    'POST /api/v1/enrollments/{id}/reject',
    'POST /api/v1/enrollments/{id}/transfer',
    'POST /api/v1/enrollments/{id}/postpone',
    'POST /api/v1/enrollments/{id}/resume',
    'POST /api/v1/enrollments/{id}/complete',
    'POST /api/v1/enrollments/{id}/cancellation-requests',
    'POST /api/v1/enrollments/{id}/retakes',
    'POST /api/v1/enrollment-cancellation-requests/{id}/approve',
    'POST /api/v1/enrollment-cancellation-requests/{id}/reject',
    'POST /api/v1/module-retakes/{id}/approve',
    'POST /api/v1/module-retakes/{id}/reject',
    'GET /api/v1/attendance/self-token',
    'GET /api/v1/sessions/{id}/attendance-anomalies',
    'GET /api/v1/attendance-policies',
    'POST /api/v1/attendance-policies',
    'POST /api/v1/sessions/{id}/qr-challenges',
    'POST /api/v1/attendance/check-in',
    'POST /api/v1/sessions/{id}/attendance/scan',
    'POST /api/v1/attendance/makeup-credits',
    'GET /api/v1/certificate-rules',
    'POST /api/v1/certificate-rules',
    'GET /api/v1/certificates/{id}/download',
    'POST /api/v1/certificates/{id}/file',
    'POST /api/v1/certificates/{id}/reissue',
    'POST /api/v1/certificates/{id}/print',
    'POST /api/v1/certificates/{id}/ready',
    'POST /api/v1/certificates/{id}/collect',
    'PATCH /api/v1/imports/batches/{id}/issues/{issueId}',
    'POST /api/v1/imports/batches/{id}/archive-quarantined',
    'GET /api/v1/messaging/otp-channel',
    'GET /api/v1/messaging/otp-channel/pairing-code',
    'POST /api/v1/messaging/otp-channel/connect',
    'POST /api/v1/messaging/otp-channel/disable',
    'POST /api/v1/messaging/otp-channel/reset',
    'POST /api/v1/auth/phone-otp/request',
    'POST /api/v1/auth/phone-otp/verify',
  ].map(success),
];

export function assertPhase5Inventory(): void {
  const openApiKeys = openApiOperations().map(({ key }) => key);
  const evidenceKeys = phase5RouteEvidence.map(({ key }) => key);
  if (openApiKeys.length !== 221)
    throw new Error(`Expected 221 OpenAPI operations, got ${openApiKeys.length}`);
  if (new Set(evidenceKeys).size !== 60)
    throw new Error('Phase 5 evidence must contain 60 unique routes');
  const unknown = evidenceKeys.filter((key) => !openApiKeys.includes(key));
  if (unknown.length) throw new Error(`Unknown Phase 5 route evidence: ${unknown.join(', ')}`);
  if (openApiKeys.filter((key) => !evidenceKeys.includes(key)).length !== 161) {
    throw new Error('Phase 5 complement must leave exactly the other 161 evidenced routes');
  }
}

export function releaseRouteInventory(): ReleaseRouteEvidence[] {
  const phase5 = new Map(phase5RouteEvidence.map((entry) => [entry.key, entry]));
  return openApiOperations().map(({ key, tags }) => {
    const current = phase5.get(key);
    if (current) return { ...current, source: phase5Source(tags) };
    const source = priorSource(tags);
    if (!source)
      throw new Error(`No successful HTTP evidence source for ${key} [${tags.join(',')}]`);
    return { key, terminal: 'SUCCESS', source };
  });
}

function openApiOperations(): Array<{ key: string; tags: string[] }> {
  const spec = JSON.parse(
    readFileSync(resolve('../../packages/api-client/openapi.json'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, { tags?: string[] }>>;
  };
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => methods.has(method))
      .map(([method, operation]) => ({
        key: `${method.toUpperCase()} ${path}`,
        tags: operation.tags ?? [],
      })),
  );
}

function phase5Source(tags: string[]): ReleaseRouteEvidence['source'] {
  if (tags.some((tag) => ['identity', 'branches', 'roles', 'users'].includes(tag))) {
    return 'phase5-iam';
  }
  if (tags.some((tag) => ['imports', 'messaging', 'realtime'].includes(tag))) {
    return 'phase5-platform';
  }
  return 'phase5-learning';
}

function priorSource(tags: string[]): ReleaseRouteEvidence['source'] | null {
  if (tags.some((tag) => ['audit', 'identity', 'platform'].includes(tag))) {
    return 'baseline-identity-platform';
  }
  if (tags.some((tag) => tag.startsWith('academic') || tag === 'crm')) return 'domain';
  if (tags.some((tag) => ['students', 'business-accounts'].includes(tag))) return 'domain';
  if (
    tags.some((tag) => ['finance', 'pricing', 'reports', 'dashboard', 'workspace'].includes(tag))
  ) {
    return 'finance-paymob';
  }
  if (tags.includes('imports')) return 'imports';
  if (tags.some((tag) => ['enrollment', 'attendance', 'certificates'].includes(tag))) {
    return 'business-chain';
  }
  return null;
}
