import { createHash } from 'node:crypto';
import type { RateLimitRule } from './rate-limit.decorator';

type RateLimitRequest = {
  accessContext?: { actorUserId?: string | undefined } | undefined;
  body?: unknown;
  ip?: string | undefined;
  query?: unknown;
  socket: { remoteAddress?: string | undefined };
};

const invisibleMarks = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

export function rateLimitKeys(
  rule: RateLimitRule,
  request: RateLimitRequest,
  pepper: string,
): string[] {
  const actor = request.accessContext?.actorUserId;
  const subjects = actor ? [`user:${actor}`] : publicSubjects(rule, request);
  const identities = subjects.length ? subjects : [`ip:${clientIp(request)}`];
  return [...new Set(identities)].map((identity) => {
    const digest = createHash('sha256').update(`${rule.name}:${identity}:${pepper}`).digest('hex');
    return `plg:rate:${digest}`;
  });
}

export type RateLimitBucket = { key: string; limit: number };

export function rateLimitBuckets(
  rule: RateLimitRule,
  request: RateLimitRequest,
  pepper: string,
): RateLimitBucket[] {
  const keys = rateLimitKeys(rule, request, pepper).map((key) => ({ key, limit: rule.limit }));
  if (request.accessContext?.actorUserId || rule.ipLimit === undefined) return keys;
  const ipKey = hashedKey(rule.name, `ip:${clientIp(request)}`, pepper);
  const withoutDuplicate = keys.filter(({ key }) => key !== ipKey);
  return [...withoutDuplicate, { key: ipKey, limit: rule.ipLimit }];
}

function hashedKey(name: string, identity: string, pepper: string): string {
  const digest = createHash('sha256').update(`${name}:${identity}:${pepper}`).digest('hex');
  return `plg:rate:${digest}`;
}

function publicSubjects(rule: RateLimitRule, request: RateLimitRequest): string[] {
  const body = record(request.body);
  const organization = canonicalText(body.organizationCode)?.toUpperCase() ?? '';
  switch (rule.subject) {
    case 'EMAIL':
      return subject('email', organization, canonicalEmail(body.email));
    case 'PHONE':
      return subject('phone', organization, canonicalPhone(body.phone));
    case 'REGISTRATION':
      return [
        ...subject('email', organization, canonicalEmail(body.email)),
        ...subject('phone', organization, canonicalPhone(body.phone)),
      ];
    case 'RESET_TOKEN':
      return subject('reset-token', organization, canonicalText(body.token));
    case 'PAYMOB_HMAC':
      return paymobSubject(request.query);
    case 'LOGIN_IDENTIFIER':
    default:
      return loginSubject(body, organization);
  }
}

function loginSubject(body: Record<string, unknown>, organization: string): string[] {
  const type = canonicalText(body.identifierType)?.toUpperCase();
  const value =
    type === 'PHONE'
      ? canonicalPhone(body.identifier)
      : type === 'EMAIL'
        ? canonicalEmail(body.identifier)
        : canonicalText(body.identifier)?.toLowerCase();
  return subject('identifier', organization, value);
}

function paymobSubject(query: unknown): string[] {
  const hmac = canonicalText(record(query).hmac)?.toLowerCase();
  return hmac && /^[a-f\d]{128}$/.test(hmac) ? [`paymob-hmac:${hmac}`] : [];
}

function subject(kind: string, organization: string, value: string | undefined): string[] {
  return organization && value ? [`${kind}:${organization}:${value}`] : [];
}

function canonicalEmail(value: unknown): string | undefined {
  return canonicalText(value)?.toLowerCase();
}

function canonicalPhone(value: unknown): string | undefined {
  const text = canonicalText(value);
  if (!text) return undefined;
  let digits = text.replace(/[^\d+]/g, '');
  if (digits.startsWith('0020')) digits = `+20${digits.slice(4)}`;
  else if (digits.startsWith('20') && !digits.startsWith('+')) digits = `+${digits}`;
  else if (digits.startsWith('01')) digits = `+2${digits}`;
  else if (/^1\d{9}$/.test(digits)) digits = `+20${digits}`;
  return digits;
}

function canonicalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.replace(invisibleMarks, '').replace(/\s+/g, ' ').trim() || undefined;
}

function clientIp(request: RateLimitRequest): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
