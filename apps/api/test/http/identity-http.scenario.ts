import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { hash } from 'argon2';
import { csrfCookieName, sessionCookieName } from '../../src/iam/auth/session-cookie.helper';
import { type HttpTestContext, runHttpScenario } from './http-test-harness';

const password = 'Identity-Http-Password!42';

export async function runIdentityHttpScenario(): Promise<void> {
  await runHttpScenario({ permissions: ['audit.read'], roleCode: 'STUDENT' }, async (context) => {
    await assertHealth(context);
    const login = await seedLogin(context);
    const session = await loginWithPassword(context, login.organizationCode, login.email);
    const me = await readCurrentUser(context, session.cookie);
    const preferences = await updatePreferences(context, session, me.version);
    const onboarding = await completeOnboarding(context, session, preferences.version);
    assert.equal(onboarding.onboardingCompleted, true);
    await proveAuditReads(context, session.cookie);
    await logout(context, session);
    await assertRevoked(context, session.sessionToken);
  });
}

async function proveAuditReads(context: HttpTestContext, cookie: string): Promise<void> {
  const list = await fetch(`${context.baseUrl}/api/v1/audit-events?limit=10`, {
    headers: { accept: 'application/json', cookie },
  });
  assert.equal(list.status, 200, await list.clone().text());
  const body = (await list.json()) as { items: Array<{ id: string }> };
  const event = body.items[0];
  assert.ok(event);
  const detail = await fetch(`${context.baseUrl}/api/v1/audit-events/${event.id}`, {
    headers: { accept: 'application/json', cookie },
  });
  assert.equal(detail.status, 200, await detail.clone().text());
  assert.equal(((await detail.json()) as { id: string }).id, event.id);
}

type LoginSession = {
  cookie: string;
  csrfToken: string;
  sessionToken: string;
};

type UserSummary = {
  id: string;
  version: number;
  preferredLocale: 'ar' | 'en' | null;
  onboardingCompleted: boolean;
};

async function assertHealth(context: HttpTestContext): Promise<void> {
  for (const path of ['health/live', 'health/ready']) {
    const response = await fetch(`${context.baseUrl}/api/v1/${path}`, {
      headers: { accept: 'application/json' },
    });
    assert.equal(response.status, 200, await response.clone().text());
  }
}

async function seedLogin(context: HttpTestContext) {
  const email = `identity-${randomUUID().slice(0, 12)}@example.test`;
  const organization = await context.prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
  });
  await context.prisma.user.update({
    where: { id: context.userId },
    data: { passwordHash: await hash(password), mustChangePassword: false },
  });
  await context.prisma.userLoginIdentifier.create({
    data: {
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'EMAIL',
      normalizedValue: email,
      verifiedAt: new Date(),
    },
  });
  return { email, organizationCode: organization.code };
}

async function loginWithPassword(
  context: HttpTestContext,
  organizationCode: string,
  email: string,
): Promise<LoginSession> {
  const response = await fetch(`${context.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      organizationCode,
      identifierType: 'EMAIL',
      identifier: email,
      password,
      rememberMe: true,
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const setCookies = response.headers.getSetCookie();
  assert.equal(setCookies.length, 2);
  assert.ok(setCookies.every((cookie) => /; Expires=/i.test(cookie)));
  const body = (await response.json()) as {
    mfaSetupRequired: boolean;
    passwordChangeRequired: boolean;
  };
  assert.equal(body.mfaSetupRequired, false);
  assert.equal(body.passwordChangeRequired, false);
  return sessionFromCookies(context, response.headers);
}

async function readCurrentUser(context: HttpTestContext, cookie: string): Promise<UserSummary> {
  const response = await fetch(`${context.baseUrl}/api/v1/auth/me`, {
    headers: { accept: 'application/json', cookie },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const body = (await response.json()) as UserSummary;
  assert.equal(body.id, context.userId);
  assert.equal(body.onboardingCompleted, false);
  return body;
}

async function updatePreferences(
  context: HttpTestContext,
  session: LoginSession,
  version: number,
): Promise<UserSummary> {
  const response = await mutate(context, session, 'PATCH', 'auth/me/preferences', version, {
    preferredLocale: 'en',
  });
  assert.equal(response.status, 200, await response.clone().text());
  const body = (await response.json()) as UserSummary;
  assert.equal(body.preferredLocale, 'en');
  assert.equal(body.version, version + 1);
  return body;
}

async function completeOnboarding(
  context: HttpTestContext,
  session: LoginSession,
  version: number,
): Promise<UserSummary> {
  const response = await mutate(context, session, 'POST', 'auth/me/onboarding/complete', version);
  assert.equal(response.status, 201, await response.clone().text());
  const body = (await response.json()) as UserSummary;
  assert.equal(body.version, version + 1);
  return body;
}

async function logout(context: HttpTestContext, session: LoginSession): Promise<void> {
  const response = await mutate(context, session, 'POST', 'auth/logout');
  assert.equal(response.status, 201, await response.clone().text());
  const rejected = await fetch(`${context.baseUrl}/api/v1/auth/me`, {
    headers: { accept: 'application/json', cookie: session.cookie },
  });
  assert.equal(rejected.status, 401);
  assert.equal(((await rejected.json()) as { code: string }).code, 'SESSION_INVALID');
}

function mutate(
  context: HttpTestContext,
  session: LoginSession,
  method: 'PATCH' | 'POST',
  path: string,
  version?: number,
  body?: unknown,
): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/${path}`, {
    method,
    headers: {
      accept: 'application/json',
      cookie: session.cookie,
      origin: context.unsafeHeaders.origin,
      'x-correlation-id': randomUUID(),
      'x-csrf-token': session.csrfToken,
      ...(version === undefined ? {} : { 'if-match': String(version) }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionFromCookies(context: HttpTestContext, headers: Headers): LoginSession {
  const config = context.app.get(ConfigService);
  const values = new Map(
    headers.getSetCookie().map((header) => {
      const pair = header.split(';', 1)[0] ?? '';
      const separator = pair.indexOf('=');
      return [pair.slice(0, separator), pair.slice(separator + 1)];
    }),
  );
  const sessionName = sessionCookieName(config);
  const csrfName = csrfCookieName(config);
  const sessionToken = values.get(sessionName);
  const csrfToken = values.get(csrfName);
  assert.ok(sessionToken);
  assert.ok(csrfToken);
  return {
    cookie: `${sessionName}=${sessionToken}; ${csrfName}=${csrfToken}`,
    csrfToken,
    sessionToken,
  };
}

async function assertRevoked(context: HttpTestContext, sessionToken: string): Promise<void> {
  const config = context.app.get(ConfigService);
  const tokenHash = createHash('sha256')
    .update(`${sessionToken}:${config.getOrThrow<string>('SESSION_PEPPER')}`)
    .digest('hex');
  const session = await context.prisma.userSession.findUniqueOrThrow({
    where: { tokenHash },
  });
  assert.ok(session.revokedAt);
}
