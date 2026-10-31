import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runHttpScenario, type HttpTestContext } from './http/http-test-harness';

const publicOperations = new Set([
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/password/reset/request',
  'POST /api/v1/auth/password/reset/complete',
  'POST /api/v1/auth/phone-otp/request',
  'POST /api/v1/auth/phone-otp/verify',
  'POST /api/v1/student-registrations',
  'GET /api/v1/certificates/verify/{token}',
  'GET /api/v1/files/{id}/content',
  'POST /api/v1/webhooks/paymob/transaction',
]);

const selfServiceOperationIds = new Set([
  'AuthController_logout_v1',
  'AuthController_me_v1',
  'AuthController_updatePreferences_v1',
  'AuthController_completeOnboarding_v1',
  'AuthController_changePassword_v1',
  'MfaController_enroll_v1',
  'MfaController_verify_v1',
  'MfaController_stepUp_v1',
  'MfaController_regenerateRecoveryCodes_v1',
  'NotificationsController_list_v1',
  'NotificationsController_markRead_v1',
  'NotificationsController_markAllRead_v1',
  'RealtimeTicketController_issue_v1',
  'SearchController_list_v1',
  'SearchController_recordRecent_v1',
]);

type Operation = { key: string; method: string; path: string; operationId: string };
type Failure = { phase: string; key: string; status: number; code?: string };
type PublicProbe = { key: string; status: number; code?: string };

const publicProbes: PublicProbe[] = [
  { key: 'GET /api/v1/health/live', status: 200 },
  { key: 'GET /api/v1/health/ready', status: 200 },
  { key: 'POST /api/v1/auth/login', status: 400, code: 'VALIDATION_FAILED' },
  {
    key: 'POST /api/v1/auth/password/reset/request',
    status: 400,
    code: 'VALIDATION_FAILED',
  },
  {
    key: 'POST /api/v1/auth/password/reset/complete',
    status: 400,
    code: 'VALIDATION_FAILED',
  },
  { key: 'POST /api/v1/auth/phone-otp/request', status: 400, code: 'VALIDATION_FAILED' },
  { key: 'POST /api/v1/auth/phone-otp/verify', status: 400, code: 'VALIDATION_FAILED' },
  { key: 'POST /api/v1/student-registrations', status: 400, code: 'VALIDATION_FAILED' },
  {
    key: 'GET /api/v1/certificates/verify/{token}',
    status: 404,
    code: 'CERTIFICATE_NOT_FOUND',
  },
  { key: 'GET /api/v1/files/{id}/content', status: 404, code: 'FILE_NOT_FOUND' },
  {
    key: 'POST /api/v1/webhooks/paymob/transaction',
    status: 400,
    code: 'PAYMOB_WEBHOOK_INVALID',
  },
];

function readOperations(): Operation[] {
  const spec = JSON.parse(
    readFileSync(resolve('../../packages/api-client/openapi.json'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, { operationId?: string }>>;
  };
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => methods.has(method))
      .map(([method, operation]) => ({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId ?? '',
      })),
  );
}

function concretePath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    if (name === 'token') return 'invalid-token';
    if (name === 'command') return 'plan';
    if (name === 'role') return 'ACCOUNTS';
    return '00000000-0000-4000-8000-000000000000';
  });
}

async function runBatch(
  operations: Operation[],
  phase: string,
  request: (operation: Operation) => Promise<Response>,
  expectedStatus: number,
  expectedCode: string,
): Promise<Failure[]> {
  const failures: Failure[] = [];
  for (let index = 0; index < operations.length; index += 12) {
    const results = await Promise.all(
      operations.slice(index, index + 12).map(async (operation) => {
        const response = await request(operation);
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        return { phase, key: operation.key, status: response.status, code: body.code };
      }),
    );
    failures.push(
      ...results.filter(({ status, code }) => status !== expectedStatus || code !== expectedCode),
    );
  }
  return failures;
}

async function runMatrix(context: HttpTestContext): Promise<Failure[]> {
  const operations = readOperations();
  const protectedOperations = operations.filter(({ key }) => !publicOperations.has(key));
  const unsafe = protectedOperations.filter(({ method }) => method !== 'GET');
  const permissionOperations = protectedOperations.filter(
    ({ operationId }) => !selfServiceOperationIds.has(operationId),
  );
  const failures = await probePublicOperations(context);
  failures.push(
    ...(await runBatch(
      unsafe,
      'cross-origin',
      (operation) =>
        send(context, operation, {
          cookie: context.safeHeaders.cookie,
          origin: 'https://attacker.invalid',
        }),
      403,
      'CSRF_ORIGIN_INVALID',
    )),
    ...(await runBatch(
      unsafe,
      'missing-token',
      (operation) =>
        send(context, operation, {
          cookie: context.safeHeaders.cookie,
          origin: context.unsafeHeaders.origin,
        }),
      403,
      'CSRF_TOKEN_INVALID',
    )),
    ...(await runBatch(
      permissionOperations,
      'no-grants',
      (operation) =>
        send(
          context,
          operation,
          operation.method === 'GET' ? context.safeHeaders : context.unsafeHeaders,
        ),
      403,
      'PERMISSION_DENIED',
    )),
  );
  await probePayloadLimit(context, failures);
  console.log(
    JSON.stringify({
      operations: operations.length,
      publicOperations: publicProbes.length,
      protected: protectedOperations.length,
      unsafe: unsafe.length,
      permissionOperations: permissionOperations.length,
      failures,
    }),
  );
  return failures;
}

async function probePublicOperations(context: HttpTestContext): Promise<Failure[]> {
  const failures: Failure[] = [];
  for (const probe of publicProbes) {
    const [method, path] = probe.key.split(' ') as [string, string];
    const response = await fetch(context.baseUrl + concretePath(path), {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    if (response.status !== probe.status || body.code !== probe.code) {
      failures.push({
        phase: 'public-boundary',
        key: probe.key,
        status: response.status,
        code: body.code,
      });
    }
  }
  return failures;
}

function send(
  context: HttpTestContext,
  operation: Operation,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(context.baseUrl + concretePath(operation.path), {
    method: operation.method,
    headers: { accept: 'application/json', 'content-type': 'application/json', ...headers },
    ...(operation.method === 'GET' ? {} : { body: '{}' }),
    redirect: 'manual',
  });
}

async function probePayloadLimit(context: HttpTestContext, failures: Failure[]): Promise<void> {
  const response = await fetch(`${context.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'a'.repeat(150_000) }),
  });
  const body = (await response.json()) as { code?: string; correlationId?: string };
  if (
    response.status !== 413 ||
    body.code !== 'PAYLOAD_TOO_LARGE' ||
    !/^[\da-f-]{36}$/i.test(body.correlationId ?? '')
  ) {
    failures.push({
      phase: 'payload-limit',
      key: 'POST /api/v1/auth/login',
      status: response.status,
      code: body.code,
    });
  }
}

async function main(): Promise<void> {
  const failures = await runHttpScenario({ permissions: [] }, runMatrix);
  process.exit(failures.length ? 2 : 0);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
