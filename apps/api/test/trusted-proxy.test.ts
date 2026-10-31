import express, { type Request } from 'express';
import { describe, expect, it } from 'vitest';
import { rateLimitBuckets } from '../src/platform/rate-limit/rate-limit-key';
import { trustedProxyAddress } from '../src/platform/http/trusted-proxy';

const registrationRule = {
  name: 'student_registration',
  limit: 5,
  ipLimit: 30,
  windowSeconds: 900,
  subject: 'REGISTRATION' as const,
};

describe('Cloudflare Tunnel proxy boundary', () => {
  it('trusts only the configured Caddy address, including its IPv4-mapped form', () => {
    const trust = trustedProxyAddress('172.30.240.2');
    expect(trust('172.30.240.2')).toBe(true);
    expect(trust('::ffff:172.30.240.2')).toBe(true);
    expect(trust('172.30.240.3')).toBe(false);
    expect(trust('127.0.0.1')).toBe(false);
  });

  it('separates Caddy-normalized clients and ignores XFF from any untrusted peer', () => {
    const app = express();
    app.set('trust proxy', trustedProxyAddress('172.30.240.2'));
    const firstRequest = proxyRequest(app, '172.30.240.2', '203.0.113.10');
    const secondRequest = proxyRequest(app, '172.30.240.2', '203.0.113.11');
    const first = rateLimitBuckets(registrationRule, firstRequest, 'pepper');
    const second = rateLimitBuckets(registrationRule, secondRequest, 'pepper');
    expect(first.at(-1)?.key).not.toBe(second.at(-1)?.key);

    const spoofedFirst = proxyRequest(app, '172.30.240.99', '198.51.100.10');
    const spoofedSecond = proxyRequest(app, '172.30.240.99', '198.51.100.11');
    expect(spoofedFirst.ip).toBe('172.30.240.99');
    expect(spoofedSecond.ip).toBe('172.30.240.99');
    expect(rateLimitBuckets(registrationRule, spoofedFirst, 'pepper').at(-1)?.key).toBe(
      rateLimitBuckets(registrationRule, spoofedSecond, 'pepper').at(-1)?.key,
    );
  });
});

function proxyRequest(
  app: ReturnType<typeof express>,
  remoteAddress: string,
  forwardedFor: string,
): Request {
  const request = Object.create(app.request) as Request;
  Object.defineProperties(request, {
    app: { value: app },
    headers: { value: { 'x-forwarded-for': forwardedFor } },
    socket: { value: { remoteAddress } },
  });
  return request;
}
