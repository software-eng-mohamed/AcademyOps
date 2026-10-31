import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { FinanceController } from '../src/finance/finance.controller';
import { CertificatesController } from '../src/certificates/certificates.controller';
import { FilesController } from '../src/platform/files/files.controller';
import { AuthController } from '../src/iam/auth/auth.controller';
import { PhoneOtpController } from '../src/iam/auth/phone-otp.controller';
import { RATE_LIMIT, type RateLimitRule } from '../src/platform/rate-limit/rate-limit.decorator';
import { rateLimitBuckets, rateLimitKeys } from '../src/platform/rate-limit/rate-limit-key';
import { StudentRegistrationController } from '../src/students/student-registration.controller';

const pepper = 'rate-limit-test-pepper';

describe('route-aware rate-limit keys', () => {
  it('isolates reset users while canonical email variants share a bucket', () => {
    const rule = configured('EMAIL');
    const first = keys(rule, { organizationCode: ' plg ', email: ' User@Example.COM ' });
    const same = keys(rule, { organizationCode: 'PLG', email: 'user@example.com' });
    const other = keys(rule, { organizationCode: 'PLG', email: 'other@example.com' });

    expect(first).toEqual(same);
    expect(first).not.toEqual(other);
    expect(new Set([...first, ...other]).size).toBe(2);
  });

  it('canonicalizes Egyptian phone variants and isolates different OTP targets', () => {
    const rule = configured('PHONE');
    expect(keys(rule, { organizationCode: 'PLG', phone: '010 1234 5678' })).toEqual(
      keys(rule, { organizationCode: 'PLG', phone: '+20-10-1234-5678' }),
    );
    expect(keys(rule, { organizationCode: 'PLG', phone: '01012345678' })).not.toEqual(
      keys(rule, { organizationCode: 'PLG', phone: '01112345678' }),
    );
  });

  it('limits registration independently by both canonical email and phone', () => {
    const rule = configured('REGISTRATION');
    const first = keys(rule, {
      organizationCode: 'PLG',
      email: 'first@example.com',
      phone: '01012345678',
    });
    const other = keys(rule, {
      organizationCode: 'PLG',
      email: 'other@example.com',
      phone: '01112345678',
    });

    expect(first).toHaveLength(2);
    expect(other).toHaveLength(2);
    expect(first.some((key) => other.includes(key))).toBe(false);
  });

  it('prevents an invalid webhook flood from exhausting a legitimate HMAC bucket', () => {
    const rule = configured('PAYMOB_HMAC');
    const invalid = requestKeys(rule, {}, { hmac: 'invalid' }, '198.51.100.10');
    const legitimate = requestKeys(
      rule,
      { obj: { id: 42 } },
      { hmac: 'a'.repeat(128) },
      '198.51.100.10',
    );
    const another = requestKeys(
      rule,
      { obj: { id: 43 } },
      { hmac: 'b'.repeat(128) },
      '198.51.100.10',
    );
    const buckets = new Map<string, number>();
    for (let index = 0; index < 301; index += 1) increment(buckets, invalid[0]!);

    expect(buckets.get(invalid[0]!)).toBe(301);
    expect(buckets.get(legitimate[0]!)).toBeUndefined();
    expect(legitimate).not.toEqual(invalid);
    expect(legitimate).not.toEqual(another);
    expect(JSON.stringify([invalid, legitimate, another])).not.toContain('a'.repeat(128));
    expect(legitimate[0]).toMatch(/^plg:rate:[a-f\d]{64}$/);
  });

  it('uses only the HMAC fingerprint for valid Paymob callbacks and never trusts body IDs', () => {
    const rule = configured('PAYMOB_HMAC');
    const hmac = 'c'.repeat(128);
    const first = requestKeys(rule, { obj: { id: 'first' } }, { hmac }, '192.0.2.1');
    const changedBody = requestKeys(rule, { obj: { id: 'attacker-value' } }, { hmac }, '192.0.2.2');

    expect(first).toEqual(changedBody);
    expect(JSON.stringify(first)).not.toMatch(/first|attacker|cccccccc/i);
  });

  it('declares the intended strategy on every public sensitive route', () => {
    expect(metadata(AuthController.prototype, 'requestPasswordReset').subject).toBe(
      'LOGIN_IDENTIFIER',
    );
    expect(metadata(AuthController.prototype, 'completePasswordReset').subject).toBe('RESET_TOKEN');
    expect(metadata(PhoneOtpController.prototype, 'request').subject).toBe('PHONE');
    expect(metadata(PhoneOtpController.prototype, 'verify').subject).toBe('PHONE');
    expect(metadata(StudentRegistrationController.prototype, 'register').subject).toBe(
      'REGISTRATION',
    );
    expect(metadata(FinanceController.prototype, 'handlePaymobWebhook').subject).toBe(
      'PAYMOB_HMAC',
    );
    expect(metadata(AuthController.prototype, 'login').ipLimit).toBe(100);
    expect(metadata(StudentRegistrationController.prototype, 'register').ipLimit).toBe(30);
    expect(metadata(FinanceController.prototype, 'handlePaymobWebhook').ipLimit).toBe(1_000);
    expect(metadata(CertificatesController.prototype, 'verify').limit).toBe(120);
    expect(metadata(FilesController.prototype, 'content').limit).toBe(120);
  });

  it('adds a separate IP ceiling so rotating identifiers cannot bypass throttling', () => {
    const rule = { ...configured('LOGIN_IDENTIFIER'), ipLimit: 100 };
    const first = rateLimitBuckets(
      rule,
      {
        body: { organizationCode: 'PLG', identifierType: 'EMAIL', identifier: 'a@example.com' },
        query: {},
        ip: '203.0.113.20',
        socket: {},
      },
      pepper,
    );
    const rotated = rateLimitBuckets(
      rule,
      {
        body: { organizationCode: 'PLG', identifierType: 'EMAIL', identifier: 'b@example.com' },
        query: {},
        ip: '203.0.113.20',
        socket: {},
      },
      pepper,
    );

    expect(first).toHaveLength(2);
    expect(first[0]?.key).not.toBe(rotated[0]?.key);
    expect(first[1]).toEqual(rotated[1]);
    expect(first.map(({ limit }) => limit)).toEqual([5, 100]);
  });
});

function configured(subject: NonNullable<RateLimitRule['subject']>): RateLimitRule {
  return { name: `test.${subject}`, limit: 5, windowSeconds: 60, subject };
}

function keys(rule: RateLimitRule, body: Record<string, unknown>): string[] {
  return requestKeys(rule, body, {}, '203.0.113.5');
}

function requestKeys(rule: RateLimitRule, body: unknown, query: unknown, ip: string): string[] {
  return rateLimitKeys(rule, { body, query, ip, socket: {} }, pepper);
}

function increment(buckets: Map<string, number>, key: string): void {
  buckets.set(key, (buckets.get(key) ?? 0) + 1);
}

function metadata(prototype: object, method: string): RateLimitRule {
  const handler = Object.getOwnPropertyDescriptor(prototype, method)?.value as unknown;
  if (typeof handler !== 'function') throw new Error(`Missing handler ${method}`);
  return Reflect.getMetadata(RATE_LIMIT, handler) as RateLimitRule;
}
