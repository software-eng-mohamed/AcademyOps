import { describe, expect, it, vi } from 'vitest';
import { CorrelationIdMiddleware } from '../src/platform/http/correlation-id.middleware';

describe('correlation id boundary', () => {
  it('keeps safe identifiers and replaces control characters before logging or headers', () => {
    const middleware = new CorrelationIdMiddleware();
    const next = vi.fn();
    const response = { setHeader: vi.fn() };
    const safe: { headers: Record<string, string>; header: () => string } = {
      headers: {},
      header: () => 'request-123:child',
    };
    middleware.use(safe as never, response as never, next);
    expect(safe.headers).toEqual({ 'x-correlation-id': 'request-123:child' });

    const malicious: { headers: Record<string, string>; header: () => string } = {
      headers: {},
      header: () => 'ok\r\nX-Injected: yes',
    };
    middleware.use(malicious as never, response as never, next);
    expect(malicious.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.setHeader).not.toHaveBeenCalledWith(
      'x-correlation-id',
      expect.stringContaining('\n'),
    );
  });
});
