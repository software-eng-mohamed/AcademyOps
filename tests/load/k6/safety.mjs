export const profiles = {
  10: { users: 10, ramp: '30s', hold: '5m', cooldown: '30s', minimumRunners: 1 },
  50: { users: 50, ramp: '1m', hold: '10m', cooldown: '1m', minimumRunners: 1 },
  250: { users: 250, ramp: '2m', hold: '15m', cooldown: '2m', minimumRunners: 1 },
  1000: { users: 1000, ramp: '5m', hold: '20m', cooldown: '5m', minimumRunners: 1 },
  2500: { users: 2500, ramp: '7m', hold: '20m', cooldown: '7m', minimumRunners: 2 },
  5000: { users: 5000, ramp: '10m', hold: '30m', cooldown: '10m', minimumRunners: 2 },
  7500: { users: 7500, ramp: '12m', hold: '30m', cooldown: '12m', minimumRunners: 4 },
  10000: { users: 10000, ramp: '15m', hold: '60m', cooldown: '15m', minimumRunners: 4 },
};

export const roles = ['student', 'attendance', 'accounts', 'owner'];
export const sustainedOwnerReads = [
  { path: '/api/v1/dashboard/overview', permission: 'reports.operations.read' },
  { path: '/api/v1/students?limit=25', permission: 'students.read_basic' },
  { path: '/api/v1/programs?limit=25', permission: 'academic.catalog.read' },
];
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function httpOrigin(raw, name) {
  const matched =
    /^(https?):\/\/(\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d+))?\/?$/i.exec(raw);
  if (!matched) throw new Error(`${name} must be an HTTP(S) origin without path/query.`);
  const protocol = `${matched[1].toLowerCase()}:`;
  const hostname = matched[2].toLowerCase();
  const portNumber = matched[3] ? Number(matched[3]) : null;
  if (
    portNumber !== null &&
    (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535)
  ) {
    throw new Error(`${name} must be an HTTP(S) origin without path/query.`);
  }
  const defaultPort =
    (protocol === 'http:' && portNumber === 80) || (protocol === 'https:' && portNumber === 443);
  const port = portNumber !== null && !defaultPort ? `:${portNumber}` : '';
  return {
    protocol,
    hostname,
    pathname: '/',
    search: '',
    origin: `${protocol}//${hostname}${port}`,
  };
}

export function repositoryFile(path) {
  const normalized = path.replace(/\\/g, '/');
  return /^(?:[a-z]:\/|\/)/i.test(normalized) ? normalized : `../../../${normalized}`;
}

function integer(environment, name, fallback) {
  const value = environment[name] ? Number(environment[name]) : fallback;
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

export function loadConfiguration(environment) {
  const target = httpOrigin(
    environment.E2E_LOAD_BASE_URL || 'http://127.0.0.1:3100',
    'E2E_LOAD_BASE_URL',
  );
  if (!localHosts.has(target.hostname)) {
    if (environment.E2E_LOAD_REMOTE !== 'synthetic-only') {
      throw new Error('Remote load requires E2E_LOAD_REMOTE=synthetic-only.');
    }
    const allowedRaw = environment.E2E_LOAD_ALLOWED_ORIGIN;
    if (!allowedRaw) throw new Error('Remote load requires E2E_LOAD_ALLOWED_ORIGIN.');
    const allowed = httpOrigin(allowedRaw, 'E2E_LOAD_ALLOWED_ORIGIN');
    if (allowedRaw !== allowed.origin || allowed.origin !== target.origin) {
      throw new Error('Remote target must exactly equal allowed origin; wildcards and paths fail.');
    }
  }
  const profileName = environment.E2E_LOAD_PROFILE || '10';
  const profile = profiles[profileName];
  if (!profile) throw new Error(`Unknown load profile ${profileName}.`);
  const runnerCount = integer(environment, 'E2E_LOAD_RUNNER_COUNT', 1);
  const runnerIndex = integer(environment, 'E2E_LOAD_RUNNER_INDEX', 0);
  if (runnerCount < 1 || runnerIndex >= runnerCount)
    throw new Error('Runner coordinates are invalid.');
  const override = environment.E2E_LOAD_SINGLE_RUNNER_OVERRIDE === 'acknowledge-resource-risk';
  if (runnerCount < profile.minimumRunners && !override) {
    throw new Error(`Profile ${profileName} requires at least ${profile.minimumRunners} runners.`);
  }
  const localUsers = Math.floor((profile.users + runnerCount - 1 - runnerIndex) / runnerCount);
  if (localUsers < 4) throw new Error('Each active runner must receive at least four users.');
  const revision =
    environment.E2E_LOAD_REVISION || (localHosts.has(target.hostname) ? 'local-worktree' : '');
  if (!revision || (revision !== 'local-worktree' && !/^[a-f0-9]{7,64}$/i.test(revision))) {
    throw new Error('Remote load requires E2E_LOAD_REVISION set to the deployed Git revision.');
  }
  const gateMaxAgeMinutes = Number(environment.E2E_LOAD_GATE_MAX_AGE_MINUTES || 360);
  if (!Number.isFinite(gateMaxAgeMinutes) || gateMaxAgeMinutes < 1 || gateMaxAgeMinutes > 1440) {
    throw new Error('E2E_LOAD_GATE_MAX_AGE_MINUTES must be from 1 through 1440.');
  }
  return {
    target,
    profileName,
    profile,
    runnerCount,
    runnerIndex,
    localUsers,
    revision,
    gateMaxAgeMinutes,
  };
}

export function roleAllocations(users) {
  if (!Number.isInteger(users) || users < 4)
    throw new Error('At least four local users are required.');
  const owner = Math.max(1, Math.round(users * 0.01));
  const accounts = Math.max(1, Math.round(users * 0.02));
  const attendance = Math.max(1, Math.round(users * 0.03));
  return { student: users - owner - accounts - attendance, attendance, accounts, owner };
}

export function roleForOrdinal(ordinal, users) {
  const allocation = roleAllocations(users);
  let cursor = 0;
  for (const role of roles) {
    const end = cursor + allocation[role];
    if (ordinal < end) return { role, index: ordinal - cursor };
    cursor = end;
  }
  throw new Error('Role allocation is inconsistent.');
}

function assertSession(session) {
  if (
    !roles.includes(session.role) ||
    !/^load-(student|attendance|accounts|owner)-\d+$/.test(session.syntheticSubjectId)
  ) {
    throw new Error('Synthetic session role or subject marker is invalid.');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    (session.role === 'student') !==
    Boolean(session.enrollmentId && uuid.test(session.enrollmentId))
  ) {
    throw new Error('Only student sessions must have a valid synthetic enrollment binding.');
  }
  if (
    !Number.isFinite(Date.parse(session.expiresAt)) ||
    Date.parse(session.expiresAt) <= Date.now()
  ) {
    throw new Error('Synthetic session is expired.');
  }
  const names = Object.keys(session.cookies || {})
    .sort()
    .join(',');
  if (names !== 'plg_csrf,plg_session' && names !== '__Host-plg_csrf,__Host-plg_session') {
    throw new Error('Session cookie pair is invalid.');
  }
  if (Object.values(session.cookies).some((value) => value.length < 20 || value.length > 512)) {
    throw new Error('Session cookie token is invalid.');
  }
}

export function parseSessions(raw, config) {
  if (/"(?:password|totpSecret|email|phone)"\s*:/i.test(raw) || /janna/i.test(raw)) {
    throw new Error('Session artifact includes a forbidden credential, PII, or real marker.');
  }
  const artifact = JSON.parse(raw);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    artifact.marker !== 'plg-synthetic-load-sessions-v1' ||
    artifact.fixtureMarker !== 'plg-synthetic-e2e-v1' ||
    artifact.revision !== config.revision ||
    artifact.organization?.code !== 'E2EACADEMY' ||
    !artifact.organization?.name?.toUpperCase().includes('SYNTHETIC E2E') ||
    artifact.targetOrigin !== config.target.origin ||
    artifact.runner?.index !== config.runnerIndex ||
    artifact.runner?.count !== config.runnerCount ||
    !uuid.test(artifact.targets?.attendanceSessionId) ||
    !Array.isArray(artifact.sessions)
  ) {
    throw new Error('Session artifact is not bound to this synthetic target and runner.');
  }
  artifact.sessions.forEach(assertSession);
  const subjects = new Set(artifact.sessions.map((session) => session.syntheticSubjectId));
  if (subjects.size !== artifact.sessions.length)
    throw new Error('Synthetic subjects must be unique.');
  const allocation = roleAllocations(config.localUsers);
  for (const role of roles) {
    if (artifact.sessions.filter((session) => session.role === role).length < allocation[role]) {
      throw new Error(`Not enough unique ${role} sessions for this runner.`);
    }
  }
  return artifact;
}

export function sessionFor(artifact, role, index) {
  const sessions = artifact.sessions.filter((session) => session.role === role);
  const session = sessions[index];
  if (!session) throw new Error(`No unique ${role} session exists for VU index ${index}.`);
  const csrfName = Object.keys(session.cookies).find((name) => name.endsWith('plg_csrf'));
  return {
    cookie: Object.entries(session.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
    csrf: session.cookies[csrfName],
    enrollmentId: session.enrollmentId,
  };
}

export function assertPreviousGate(raw, config) {
  const names = Object.keys(profiles);
  const previous = names[names.indexOf(config.profileName) - 1];
  if (!previous) return;
  if (!raw) throw new Error(`Profile ${config.profileName} requires a passing ${previous} gate.`);
  const gate = JSON.parse(raw);
  const maxAgeMinutes = config.gateMaxAgeMinutes;
  const ageMs = Date.now() - Date.parse(gate.generatedAt);
  if (
    gate.marker !== 'plg-synthetic-load-gate-v1' ||
    gate.fixtureMarker !== 'plg-synthetic-e2e-v1' ||
    gate.revision !== config.revision ||
    !Number.isFinite(ageMs) ||
    ageMs < 0 ||
    ageMs > maxAgeMinutes * 60_000 ||
    gate.targetOrigin !== config.target.origin ||
    gate.profile !== previous ||
    gate.passed !== true ||
    gate.suites?.http?.passed !== true ||
    gate.suites?.realtime?.passed !== true
  ) {
    throw new Error('Previous gate is failed, mismatched, or incomplete.');
  }
}
