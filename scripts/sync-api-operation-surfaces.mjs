import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const openApiPath = path.join(workspaceRoot, 'packages', 'api-client', 'openapi.json');
const manifestPath = path.join(workspaceRoot, 'docs', 'api-operation-surfaces.json');
const initialize = process.argv.includes('--initialize');

const surfaceDescriptions = {
  dashboard: 'Authenticated operations consumed by the dashboard application.',
  'public-auth': 'Unauthenticated sign-in and account-recovery operations.',
  'public-registration': 'Unauthenticated student registration entry point.',
  'public-verification': 'Unauthenticated certificate verification.',
  'asset-delivery': 'Token-protected browser asset delivery.',
  integration: 'Server-to-server integration callbacks; never called by dashboard UI.',
  infrastructure: 'Liveness and readiness probes; never rendered as dashboard features.',
  unclassified: 'New operation awaiting an explicit product surface decision.',
};

const specialSurfaces = new Map([
  ['AuthController_login_v1', 'public-auth'],
  ['AuthController_requestPasswordReset_v1', 'public-auth'],
  ['AuthController_completePasswordReset_v1', 'public-auth'],
  ['PhoneOtpController_request_v1', 'public-auth'],
  ['PhoneOtpController_verify_v1', 'public-auth'],
  ['StudentRegistrationController_register_v1', 'public-registration'],
  ['CertificatesController_verify_v1', 'public-verification'],
  ['FilesController_content_v1', 'asset-delivery'],
  ['FinanceController_handlePaymobWebhook_v1', 'integration'],
  ['HealthController_live_v1', 'infrastructure'],
  ['HealthController_ready_v1', 'infrastructure'],
]);

const document = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
const operationIds = [];
for (const pathItem of Object.values(document.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operationId = pathItem?.[method]?.operationId;
    if (operationId) operationIds.push(operationId);
  }
}
operationIds.sort((left, right) => left.localeCompare(right));

const existing = fs.existsSync(manifestPath)
  ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')).operations ?? {})
  : {};
const operations = Object.fromEntries(
  operationIds.map((operationId) => [
    operationId,
    existing[operationId] ??
      specialSurfaces.get(operationId) ??
      (initialize ? 'dashboard' : 'unclassified'),
  ]),
);
const manifest = { version: 1, surfaceDescriptions, operations };
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const unclassified = Object.values(operations).filter(
  (surface) => surface === 'unclassified',
).length;
console.log(
  `Synchronized ${operationIds.length} operation surfaces (${unclassified} unclassified).`,
);
