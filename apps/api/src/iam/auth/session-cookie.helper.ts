import { createHash, randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Response } from 'express';

export type IssueSessionInput = {
  organizationId: string;
  userId: string;
  mfaVerified: boolean;
  policy?: SessionPolicy;
};

export type SessionPolicy = 'STANDARD' | 'REMEMBERED';

const sessionPolicies = {
  STANDARD: { lifetimeMs: 12 * 60 * 60 * 1_000, idleTimeoutSeconds: 30 * 60 },
  REMEMBERED: { lifetimeMs: 30 * 24 * 60 * 60 * 1_000, idleTimeoutSeconds: 7 * 24 * 60 * 60 },
} as const;

export type IssuedSession = {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  persistent: boolean;
};

export async function issueUserSession(
  db: Prisma.TransactionClient | PrismaClient,
  sessionPepper: string,
  input: IssueSessionInput,
): Promise<IssuedSession> {
  const sessionToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const policy = sessionPolicies[input.policy ?? 'STANDARD'];
  const expiresAt = new Date(Date.now() + policy.lifetimeMs);
  const tokenHash = createHash('sha256').update(`${sessionToken}:${sessionPepper}`).digest('hex');
  const csrfSecretHash = createHash('sha256').update(csrfToken).digest('hex');

  await db.userSession.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      tokenHash,
      csrfSecretHash,
      mfaVerifiedAt: input.mfaVerified ? new Date() : null,
      idleTimeoutSeconds: policy.idleTimeoutSeconds,
      expiresAt,
    },
  });

  return { sessionToken, csrfToken, expiresAt, persistent: input.policy === 'REMEMBERED' };
}

export function selectLoginSessionPolicy(rememberMe: boolean | undefined): SessionPolicy {
  return rememberMe ? 'REMEMBERED' : 'STANDARD';
}

export function setSessionCookies(
  response: Response,
  config: ConfigService,
  result: IssuedSession,
): void {
  const secure = secureCookieMode(config);
  const persistence = result.persistent ? { expires: result.expiresAt } : {};
  response.cookie(sessionCookieName(config), result.sessionToken, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'strict' : 'lax',
    priority: 'high',
    path: '/',
    ...persistence,
  });
  response.cookie(csrfCookieName(config), result.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: secure ? 'strict' : 'lax',
    priority: 'high',
    path: '/',
    ...persistence,
  });
}

export function clearSessionCookies(response: Response, config: ConfigService): void {
  const secure = secureCookieMode(config);
  for (const name of [
    sessionCookieName(config),
    csrfCookieName(config),
    'plg_session',
    'plg_csrf',
    '__Host-plg_session',
    '__Host-plg_csrf',
  ]) {
    response.clearCookie(name, { path: '/', secure, sameSite: secure ? 'strict' : 'lax' });
  }
}

export function sessionCookieName(config: ConfigService): string {
  return secureCookieMode(config) ? '__Host-plg_session' : 'plg_session';
}

export function csrfCookieName(config: ConfigService): string {
  return secureCookieMode(config) ? '__Host-plg_csrf' : 'plg_csrf';
}

function secureCookieMode(config: ConfigService): boolean {
  if (config.get<string>('COOKIE_SECURE') === 'false') return false;
  if (config.get<string>('NODE_ENV') === 'production') return true;
  const origin = config.get<string>('WEB_ORIGIN');
  if (!origin) return false;
  try {
    return new URL(origin).protocol === 'https:';
  } catch {
    return false;
  }
}
