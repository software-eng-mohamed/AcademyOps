import { describe, expect, it, vi } from 'vitest';
import { PlgApiError } from './errors.js';
import { PlgHttpTransport } from './transport.js';

const jsonHeaders = { 'content-type': 'application/json' };

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...Object.fromEntries(new Headers(headers)) },
  });
}

describe('PlgHttpTransport', () => {
  it('performs one HTTP attempt and exposes Retry-After to its consumer', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      jsonResponse({ code: 'BUSY', messageKey: 'errors.busy' }, 503, {
        'retry-after': '2',
      }),
    );
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetchImplementation,
    });

    await expect(transport.request('/health')).rejects.toMatchObject({
      attempts: 1,
      requestMethod: 'GET',
      retryAfterMs: 2_000,
      status: 503,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('does not replay a mutation without an idempotency key', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'BUSY', messageKey: 'errors.busy' }, 503));
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetchImplementation,
    });

    await expect(transport.request('/payments', { method: 'POST' })).rejects.toMatchObject({
      status: 503,
      attempts: 1,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('marks an idempotent mutation but still performs only one HTTP attempt', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'BUSY', messageKey: 'errors.busy' }, 503));
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      correlationIdFactory: () => 'correlation-1',
      fetch: fetchImplementation,
      getCsrfToken: () => 'csrf-1',
    });

    const error = await transport
      .request('/payments', {
        headers: { 'Idempotency-Key': 'payment-request-1' },
        method: 'POST',
      })
      .catch((caught: unknown) => caught);

    const firstHeaders = new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers);
    expect(firstHeaders.get('idempotency-key')).toBe('payment-request-1');
    expect(firstHeaders.get('x-csrf-token')).toBe('csrf-1');
    expect(firstHeaders.get('x-correlation-id')).toBe('correlation-1');
    expect(error).toMatchObject({
      requestMethod: 'POST',
      requestWasIdempotent: true,
      status: 503,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('turns an exhausted timeout into a typed API error', async () => {
    const fetchImplementation = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetchImplementation,
      timeoutMs: 5,
    });

    await expect(transport.request('/slow')).rejects.toMatchObject({
      status: 0,
      payload: { code: 'REQUEST_TIMEOUT' },
    });
  });

  it('preserves structured errors and response correlation IDs', async () => {
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: async () =>
        jsonResponse({ code: 'VALIDATION_FAILED', messageKey: 'errors.validation' }, 422, {
          'x-correlation-id': 'server-correlation',
        }),
    });

    const error = await transport.request('/students').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlgApiError);
    expect(error).toMatchObject({
      status: 422,
      correlationId: 'server-correlation',
      retryable: false,
    });
  });

  it('does not expire the session for a forbidden CSRF response', async () => {
    const onUnauthorized = vi.fn();
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: async () =>
        jsonResponse({ code: 'CSRF_TOKEN_INVALID', messageKey: 'auth.csrfTokenInvalid' }, 403),
      onUnauthorized,
    });

    await expect(
      transport.request('/notifications/read-all', { method: 'POST' }),
    ).rejects.toMatchObject({
      payload: { code: 'CSRF_TOKEN_INVALID' },
      status: 403,
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('returns undefined for no-content responses', async () => {
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetchImplementation,
    });

    await expect(transport.request('/session', { method: 'DELETE' })).resolves.toBeUndefined();
    const headers = new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers);
    expect(headers.has('x-csrf-token')).toBe(false);
  });

  it('accepts a successful empty JSON response from command endpoints', async () => {
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: async () =>
        new Response(null, { status: 201, headers: { 'content-type': 'application/json' } }),
    });

    await expect(transport.request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('preserves an external abort without starting a request', async () => {
    const fetchImplementation = vi.fn();
    const transport = new PlgHttpTransport({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetchImplementation,
    });
    const controller = new AbortController();
    const reason = new DOMException('Cancelled by navigation', 'AbortError');
    controller.abort(reason);

    await expect(transport.request('/students', { signal: controller.signal })).rejects.toBe(
      reason,
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
