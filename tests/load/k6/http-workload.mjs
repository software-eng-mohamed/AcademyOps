import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import {
  assertPreviousGate,
  loadConfiguration,
  parseSessions,
  repositoryFile,
  roleForOrdinal,
  sessionFor,
  sustainedOwnerReads,
} from './safety.mjs';

const config = loadConfiguration(__ENV);
const sessionPath =
  __ENV.E2E_LOAD_SESSIONS_FILE || `test-results/load/sessions-r${config.runnerIndex}.json`;
const artifact = parseSessions(open(repositoryFile(sessionPath)), config);
const previousGate = __ENV.E2E_LOAD_PREVIOUS_GATE
  ? open(repositoryFile(__ENV.E2E_LOAD_PREVIOUS_GATE))
  : null;
assertPreviousGate(previousGate, config);

const responseInvalid = new Rate('response_invalid');
const securityFailures = new Counter('security_failures');

export const options = {
  discardResponseBodies: false,
  systemTags: [
    'proto',
    'status',
    'method',
    'name',
    'group',
    'check',
    'error',
    'error_code',
    'scenario',
    'expected_response',
  ],
  scenarios: {
    roleTraffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: config.profile.ramp, target: config.localUsers },
        { duration: config.profile.hold, target: config.localUsers },
        { duration: config.profile.cooldown, target: 0 },
      ],
      gracefulRampDown: '30s',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    checks: [{ threshold: 'rate>0.999', abortOnFail: true, delayAbortEval: '30s' }],
    http_req_failed: [{ threshold: 'rate<0.001', abortOnFail: true, delayAbortEval: '30s' }],
    'http_req_duration{request_class:simple}': ['p(95)<400', 'p(99)<1000'],
    'http_req_duration{request_class:dashboard}': ['p(95)<1500', 'p(99)<3000'],
    response_invalid: [{ threshold: 'rate<0.001', abortOnFail: true, delayAbortEval: '30s' }],
    security_failures: [{ threshold: 'count==0', abortOnFail: true }],
  },
};

function requestHeaders(session) {
  return {
    accept: 'application/json',
    cookie: session.cookie,
    origin: config.target.origin,
    'x-csrf-token': session.csrf,
  };
}

function validJson(response) {
  if (!response.headers['Content-Type']?.toLowerCase().includes('application/json')) return false;
  try {
    const value = response.json();
    return Boolean(value && typeof value === 'object');
  } catch {
    return false;
  }
}

function sanitizedRouteName(path) {
  return path
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id');
}

function get(path, role, session, requestClass = 'simple') {
  const response = http.get(`${config.target.origin}${path}`, {
    headers: requestHeaders(session),
    redirects: 0,
    tags: { name: sanitizedRouteName(path), role, request_class: requestClass },
  });
  const securityFailure = response.status === 401 || response.status === 403;
  securityFailures.add(securityFailure ? 1 : 0);
  const valid = response.status === 200 && validJson(response);
  responseInvalid.add(!valid);
  check(response, { 'read response is valid': () => valid });
  return response;
}

function verifyTenant(role, session) {
  const response = get('/api/v1/auth/me', role, session);
  let isolated = false;
  try {
    const body = response.json();
    isolated =
      body?.organization?.code === 'E2EACADEMY' &&
      body?.organization?.name?.toUpperCase().includes('SYNTHETIC E2E');
  } catch {
    isolated = false;
  }
  securityFailures.add(isolated ? 0 : 1);
  check(response, { 'tenant remains synthetic': () => isolated });
}

const future = new Date(Date.now() + 45 * 86_400_000).toISOString();
const past = new Date(Date.now() - 45 * 86_400_000).toISOString();
const calendar = `/api/v1/calendar?from=${encodeURIComponent(past)}&to=${encodeURIComponent(future)}`;
function endpointsFor(role, session) {
  if (role === 'student') {
    const enrollment = encodeURIComponent(session.enrollmentId);
    return [
      '/api/v1/enrollments?limit=20',
      calendar,
      `/api/v1/enrollments/${enrollment}/attendance-summary`,
      `/api/v1/enrollments/${enrollment}/installments?limit=10`,
      `/api/v1/enrollments/${enrollment}/finance-summary`,
      `/api/v1/payments?enrollmentId=${enrollment}&limit=10`,
    ];
  }
  if (role === 'attendance') {
    const target = encodeURIComponent(artifact.targets.attendanceSessionId);
    return [
      calendar,
      '/api/v1/sessions?limit=50',
      `/api/v1/sessions/${target}/attendance?limit=50`,
    ];
  }
  const endpoints = {
    accounts: [
      '/api/v1/payments?limit=50',
      '/api/v1/enrollments?limit=20',
      '/api/v1/payment-methods',
    ],
    owner: sustainedOwnerReads.map(({ path }) => path),
  };
  return endpoints[role];
}

export default function roleTraffic() {
  const assigned = roleForOrdinal(__VU - 1, config.localUsers);
  const session = sessionFor(artifact, assigned.role, assigned.index);
  verifyTenant(assigned.role, session);
  const choices = endpointsFor(assigned.role, session);
  const path = choices[__ITER % choices.length];
  get(path, assigned.role, session, path.includes('/dashboard/') ? 'dashboard' : 'simple');
  sleep(0.8 + Math.random() * 1.7);
}

function metric(data, name, field) {
  return data.metrics?.[name]?.values?.[field] ?? null;
}

export function handleSummary(data) {
  const thresholds = Object.values(data.metrics || {}).flatMap((item) =>
    Object.values(item.thresholds || {}),
  );
  const passed = thresholds.length > 0 && thresholds.every((threshold) => threshold.ok === true);
  const summary = {
    marker: 'plg-synthetic-load-summary-v1',
    fixtureMarker: 'plg-synthetic-e2e-v1',
    revision: config.revision,
    generatedAt: new Date().toISOString(),
    suite: 'http',
    profile: config.profileName,
    globalUsers: config.profile.users,
    localUsers: config.localUsers,
    targetOrigin: config.target.origin,
    runner: { index: config.runnerIndex, count: config.runnerCount },
    passed,
    metrics: {
      requestP95Ms: metric(data, 'http_req_duration', 'p(95)'),
      requestP99Ms: metric(data, 'http_req_duration', 'p(99)'),
      failedRate: metric(data, 'http_req_failed', 'rate'),
      invalidRate: metric(data, 'response_invalid', 'rate'),
      securityFailures: metric(data, 'security_failures', 'count'),
    },
  };
  const path = `test-results/load/results/http-${config.profileName}-r${config.runnerIndex}.json`;
  return {
    [path]: `${JSON.stringify(summary, null, 2)}\n`,
    stdout: 'Sanitized HTTP summary written.\n',
  };
}
