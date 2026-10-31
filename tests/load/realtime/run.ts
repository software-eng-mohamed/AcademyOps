import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { assertPreviousGate } from '../gates.js';
import {
  configuration,
  loadSessionArtifact,
  roleForOrdinal,
  type SyntheticSession,
} from '../config.js';
import { percentile, writeSummary } from '../summary.js';

const connectSlo = 0.995;
const maintainedSlo = 0.999;
const resyncP95SloMs = 2_000;
const resyncP99SloMs = 5_000;
const connectionTimeoutMs = 10_000;
const allowedTopics = new Set([
  'owner',
  'accounts',
  'attendance',
  'student',
  'calendar',
  'notifications',
  'messaging',
]);

type ManagedSocket = {
  socket: Socket;
  connected: boolean;
  everConnected: boolean;
  connectStartedAt: number;
};

function durationMs(value: string): number {
  const matched = /^(\d+)(ms|s|m)$/.exec(value);
  if (!matched) throw new Error(`Unsupported duration ${value}.`);
  const amount = Number(matched[1]);
  return amount * (matched[2] === 'm' ? 60_000 : matched[2] === 's' ? 1_000 : 1);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function sessionHeaders(session: SyntheticSession, origin: string): Record<string, string> {
  const csrfName = Object.keys(session.cookies).find((name) => name.endsWith('plg_csrf'));
  if (!csrfName) throw new Error('CSRF cookie is missing.');
  return {
    accept: 'application/json',
    cookie: Object.entries(session.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
    origin,
    'sec-fetch-site': 'same-origin',
    'x-correlation-id': randomUUID(),
    'x-csrf-token': session.cookies[csrfName]!,
  };
}

async function issueTicket(session: SyntheticSession, origin: string): Promise<string> {
  const response = await fetch(`${origin}/api/v1/realtime/ticket`, {
    method: 'POST',
    headers: sessionHeaders(session, origin),
    redirect: 'error',
    signal: AbortSignal.timeout(connectionTimeoutMs),
  });
  if (response.status === 401 || response.status === 403)
    throw new Error('SECURITY_AUTHORIZATION_FAILED');
  if (response.status !== 201) throw new Error(`TICKET_HTTP_${response.status}`);
  const value = (await response.json()) as { ticket?: unknown; expiresAt?: unknown };
  if (
    typeof value.ticket !== 'string' ||
    value.ticket.length < 20 ||
    value.ticket.length > 4_096 ||
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt))
  ) {
    throw new Error('TICKET_CONTRACT_INVALID');
  }
  return value.ticket;
}

async function main(): Promise<void> {
  const config = configuration(process.env);
  assertPreviousGate(process.env, config);
  const artifactPath =
    process.env.E2E_LOAD_SESSIONS_FILE || `test-results/load/sessions-r${config.runnerIndex}.json`;
  const artifact = loadSessionArtifact(artifactPath, config);
  const sockets: ManagedSocket[] = [];
  const pending = new Set<Promise<void>>();
  const resyncLatency: number[] = [];
  let attempts = 0;
  let connectedOnce = 0;
  let invalidMessages = 0;
  let authorizationFailures = 0;
  let aborted = false;

  const stop = () => {
    aborted = true;
    sockets.forEach(({ socket }) => socket.disconnect());
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  async function connect(session: SyntheticSession): Promise<void> {
    attempts += 1;
    let ticket: string;
    try {
      ticket = await issueTicket(session, config.target.origin);
    } catch (error) {
      if (error instanceof Error && error.message === 'SECURITY_AUTHORIZATION_FAILED') {
        authorizationFailures += 1;
        aborted = true;
      }
      return;
    }
    if (aborted) return;
    let nextTicket = ticket;
    const managed: ManagedSocket = {
      connected: false,
      everConnected: false,
      connectStartedAt: performance.now(),
      socket: io(config.target.origin, {
        path: '/socket.io',
        addTrailingSlash: false,
        transports: ['websocket'],
        upgrade: false,
        forceNew: true,
        timeout: connectionTimeoutMs,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 500,
        reconnectionDelayMax: 10_000,
        randomizationFactor: 0.5,
        extraHeaders: { Origin: config.target.origin },
        auth: (callback) => {
          const deliver = async () => {
            try {
              const currentTicket =
                nextTicket || (await issueTicket(session, config.target.origin));
              nextTicket = '';
              callback({ ticket: currentTicket });
            } catch (error) {
              if (error instanceof Error && error.message === 'SECURITY_AUTHORIZATION_FAILED') {
                authorizationFailures += 1;
                aborted = true;
              }
              callback({ ticket: '' });
            }
          };
          void deliver();
        },
      }),
    };
    sockets.push(managed);
    managed.socket.on('connect', () => {
      if (!managed.everConnected) connectedOnce += 1;
      managed.connected = true;
      managed.everConnected = true;
      managed.connectStartedAt = performance.now();
    });
    managed.socket.on('disconnect', () => {
      managed.connected = false;
    });
    managed.socket.on('realtime:resync', (message: unknown) => {
      const value = message as { v?: unknown; topics?: unknown; occurredAt?: unknown };
      const valid =
        value?.v === 1 &&
        Array.isArray(value.topics) &&
        value.topics.length > 0 &&
        value.topics.includes(session.role) &&
        value.topics.every((topic) => typeof topic === 'string' && allowedTopics.has(topic)) &&
        typeof value.occurredAt === 'string' &&
        Number.isFinite(Date.parse(value.occurredAt));
      if (!valid) invalidMessages += 1;
      else resyncLatency.push(performance.now() - managed.connectStartedAt);
    });
  }

  const byRole = Object.fromEntries(
    ['student', 'attendance', 'accounts', 'owner'].map((role) => [
      role,
      artifact.sessions.filter((session) => session.role === role),
    ]),
  ) as Record<SyntheticSession['role'], SyntheticSession[]>;
  const rampMs = durationMs(config.profile.ramp);
  const start = performance.now();
  for (let ordinal = 0; ordinal < config.localUsers && !aborted; ordinal += 1) {
    const assignment = roleForOrdinal(ordinal, config.localUsers);
    const session = byRole[assignment.role][assignment.index]!;
    const task = connect(session).finally(() => pending.delete(task));
    pending.add(task);
    const scheduled = start + ((ordinal + 1) * rampMs) / config.localUsers;
    await wait(Math.max(0, scheduled - performance.now()));
    if (attempts >= 20 && connectedOnce / attempts < connectSlo - 0.05) aborted = true;
  }
  await Promise.allSettled(pending);
  await wait(Math.min(connectionTimeoutMs, 10_000));

  let connectedSamples = 0;
  let expectedSamples = 0;
  const holdEnds = Date.now() + durationMs(config.profile.hold);
  while (!aborted && Date.now() < holdEnds) {
    expectedSamples += config.localUsers;
    connectedSamples += sockets.filter((entry) => entry.connected).length;
    await wait(1_000);
  }

  const cooldownMs = durationMs(config.profile.cooldown);
  const cooldownStart = performance.now();
  for (let index = 0; index < sockets.length; index += 1) {
    sockets[index]!.socket.disconnect();
    const scheduled = cooldownStart + ((index + 1) * cooldownMs) / sockets.length;
    await wait(Math.max(0, scheduled - performance.now()));
  }

  const connectRate = attempts ? connectedOnce / attempts : 0;
  const maintainedRate = expectedSamples ? connectedSamples / expectedSamples : 0;
  const p95 = percentile(resyncLatency, 95);
  const p99 = percentile(resyncLatency, 99);
  const passed =
    !aborted &&
    authorizationFailures === 0 &&
    invalidMessages === 0 &&
    connectRate >= connectSlo &&
    maintainedRate >= maintainedSlo &&
    p95 !== null &&
    p95 <= resyncP95SloMs &&
    p99 !== null &&
    p99 <= resyncP99SloMs;
  writeSummary(config, 'realtime', passed, {
    attempted: attempts,
    connectRate,
    maintainedRate,
    resyncP95Ms: p95,
    resyncP99Ms: p99,
    authorizationFailures,
    invalidMessages,
  });
  if (!passed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Realtime harness failed.');
  process.exitCode = 1;
});
