import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const LOAD_MARKER = 'plg-synthetic-load-sessions-v1';
export const FIXTURE_MARKER = 'plg-synthetic-e2e-v1';
export const SYNTHETIC_ORGANIZATION = 'E2EACADEMY';
export const ROLES = ['student', 'attendance', 'accounts', 'owner'] as const;
export type LoadRole = (typeof ROLES)[number];

export interface LoadProfile {
  users: number;
  ramp: string;
  hold: string;
  cooldown: string;
  minimumRunners: number;
}

export const PROFILES: Record<string, LoadProfile> = {
  '10': { users: 10, ramp: '30s', hold: '5m', cooldown: '30s', minimumRunners: 1 },
  '50': { users: 50, ramp: '1m', hold: '10m', cooldown: '1m', minimumRunners: 1 },
  '250': { users: 250, ramp: '2m', hold: '15m', cooldown: '2m', minimumRunners: 1 },
  '1000': { users: 1_000, ramp: '5m', hold: '20m', cooldown: '5m', minimumRunners: 1 },
  '2500': { users: 2_500, ramp: '7m', hold: '20m', cooldown: '7m', minimumRunners: 2 },
  '5000': { users: 5_000, ramp: '10m', hold: '30m', cooldown: '10m', minimumRunners: 2 },
  '7500': { users: 7_500, ramp: '12m', hold: '30m', cooldown: '12m', minimumRunners: 4 },
  '10000': { users: 10_000, ramp: '15m', hold: '60m', cooldown: '15m', minimumRunners: 4 },
};

export interface SyntheticSession {
  role: LoadRole;
  syntheticSubjectId: string;
  enrollmentId?: string;
  expiresAt: string;
  cookies: Record<string, string>;
}

export interface SessionArtifact {
  marker: string;
  fixtureMarker: string;
  revision: string;
  organization: { code: string; name: string };
  targetOrigin: string;
  runner: { index: number; count: number };
  targets: { attendanceSessionId: string };
  sessions: SyntheticSession[];
}

export interface LoadConfiguration {
  target: URL;
  profileName: string;
  profile: LoadProfile;
  runnerIndex: number;
  runnerCount: number;
  localUsers: number;
  revision: string;
}

const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);

export function assertTargetAllowed(rawUrl: string, environment: NodeJS.ProcessEnv): URL {
  const target = new URL(rawUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.pathname !== '/' || target.search) {
    throw new Error('E2E_LOAD_BASE_URL must be an HTTP(S) origin without a path or query.');
  }
  if (localHosts.has(target.hostname)) return target;
  if (environment.E2E_LOAD_REMOTE !== 'synthetic-only') {
    throw new Error('Remote load requires E2E_LOAD_REMOTE=synthetic-only.');
  }
  const rawAllowed = environment.E2E_LOAD_ALLOWED_ORIGIN?.trim();
  if (!rawAllowed) throw new Error('Remote load requires E2E_LOAD_ALLOWED_ORIGIN.');
  const allowed = new URL(rawAllowed);
  if (rawAllowed !== allowed.origin || target.origin !== allowed.origin) {
    throw new Error(
      'Remote target must exactly equal the allowed origin; paths and wildcards fail.',
    );
  }
  return target;
}

function integer(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = environment[name];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

export function configuration(environment: NodeJS.ProcessEnv): LoadConfiguration {
  const target = assertTargetAllowed(
    environment.E2E_LOAD_BASE_URL?.trim() || 'http://127.0.0.1:3100',
    environment,
  );
  const profileName = environment.E2E_LOAD_PROFILE?.trim() || '10';
  const profile = PROFILES[profileName];
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
  const rawRevision = environment.E2E_LOAD_REVISION?.trim();
  const revision = rawRevision || (localHosts.has(target.hostname) ? 'local-worktree' : '');
  if (!revision || (revision !== 'local-worktree' && !/^[a-f0-9]{7,64}$/i.test(revision))) {
    throw new Error('Remote runs require E2E_LOAD_REVISION set to the deployed Git revision.');
  }
  return { target, profileName, profile, runnerIndex, runnerCount, localUsers, revision };
}

export function roleAllocations(users: number): Record<LoadRole, number> {
  if (!Number.isInteger(users) || users < 4) throw new Error('At least four users are required.');
  const owner = Math.max(1, Math.round(users * 0.01));
  const accounts = Math.max(1, Math.round(users * 0.02));
  const attendance = Math.max(1, Math.round(users * 0.03));
  return { student: users - owner - accounts - attendance, attendance, accounts, owner };
}

export function roleForOrdinal(ordinal: number, users: number): { role: LoadRole; index: number } {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= users)
    throw new Error('Invalid ordinal.');
  const allocation = roleAllocations(users);
  let cursor = 0;
  for (const role of ROLES) {
    const end = cursor + allocation[role];
    if (ordinal < end) return { role, index: ordinal - cursor };
    cursor = end;
  }
  throw new Error('Role allocation is inconsistent.');
}

function rejectCredentialFields(value: string): void {
  if (/"(?:password|totpSecret|email|phone)"\s*:/i.test(value) || /janna/i.test(value)) {
    throw new Error(
      'Load artifacts must not contain login credentials, PII, or real-tenant markers.',
    );
  }
}

function assertSession(value: SyntheticSession): void {
  if (
    !ROLES.includes(value.role) ||
    !/^load-(student|attendance|accounts|owner)-\d+$/.test(value.syntheticSubjectId)
  ) {
    throw new Error('Synthetic session role or subject marker is invalid.');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if ((value.role === 'student') !== Boolean(value.enrollmentId && uuid.test(value.enrollmentId))) {
    throw new Error('Only student sessions must have a valid synthetic enrollment binding.');
  }
  if (!Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) {
    throw new Error('Synthetic session is expired.');
  }
  const names = Object.keys(value.cookies).sort();
  const local = names.join(',') === 'plg_csrf,plg_session';
  const secure = names.join(',') === '__Host-plg_csrf,__Host-plg_session';
  if (!local && !secure) throw new Error('Session cookie pair is invalid.');
  if (Object.values(value.cookies).some((token) => token.length < 20 || token.length > 512)) {
    throw new Error('Session cookie token is invalid.');
  }
}

export function loadSessionArtifact(path: string, config: LoadConfiguration): SessionArtifact {
  const raw = readFileSync(resolve(path), 'utf8');
  rejectCredentialFields(raw);
  const artifact = JSON.parse(raw) as SessionArtifact;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    artifact.marker !== LOAD_MARKER ||
    artifact.fixtureMarker !== FIXTURE_MARKER ||
    artifact.revision !== config.revision ||
    artifact.organization?.code !== SYNTHETIC_ORGANIZATION ||
    !artifact.organization?.name?.toUpperCase().includes('SYNTHETIC E2E') ||
    artifact.targetOrigin !== config.target.origin ||
    artifact.runner?.index !== config.runnerIndex ||
    artifact.runner.count !== config.runnerCount ||
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
  for (const role of ROLES) {
    if (artifact.sessions.filter((session) => session.role === role).length < allocation[role]) {
      throw new Error(`Session artifact does not contain enough unique ${role} subjects.`);
    }
  }
  return artifact;
}
