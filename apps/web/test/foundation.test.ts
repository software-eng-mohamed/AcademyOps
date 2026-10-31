import { PlgApiError } from '@academyops/api-client/http';
import { describe, expect, it, vi } from 'vitest';
import { readCsrfToken } from '@/api/browser/csrf';
import { createApiQueryClient } from '@/api/query/client';
import { mutationRetry, queryRetry, queryRetryDelay } from '@/api/query/retry-policy';
import { resolveApiOrigin, resolveServerApiUrl } from '@/api/server/environment';

describe('web foundation', () => {
  it('keeps retry policy in TanStack Query', () => {
    const client = createApiQueryClient();
    expect(client.getDefaultOptions().queries?.retry).toBe(queryRetry);
    expect(client.getDefaultOptions().mutations?.retry).toBe(mutationRetry);
  });

  it('retries a temporary query error once and never retries aborts', () => {
    const temporary = new PlgApiError(503, { code: 'BUSY', messageKey: 'errors.busy' });
    const aborted = new DOMException('Aborted', 'AbortError');
    expect(queryRetry(0, temporary)).toBe(true);
    expect(queryRetry(1, temporary)).toBe(false);
    expect(queryRetry(0, aborted)).toBe(false);
  });

  it('retries only explicitly idempotent mutations and honors Retry-After', () => {
    const ordinary = new PlgApiError(503, { code: 'BUSY', messageKey: 'errors.busy' });
    const idempotent = new PlgApiError(
      503,
      { code: 'BUSY', messageKey: 'errors.busy' },
      { requestWasIdempotent: true, retryAfterMs: 2_000 },
    );
    expect(mutationRetry(0, ordinary)).toBe(false);
    expect(mutationRetry(0, idempotent)).toBe(true);
    expect(mutationRetry(1, idempotent)).toBe(false);
    expect(queryRetryDelay(0, idempotent, () => 0)).toBe(2_000);
  });

  it('executes query and idempotent-mutation retries, but never replays an ordinary mutation', async () => {
    const client = createApiQueryClient();
    const rateLimited = new PlgApiError(
      429,
      { code: 'RATE_LIMIT_EXCEEDED', messageKey: 'security.rateLimitExceeded' },
      { retryAfterMs: 1 },
    );
    const query = vi.fn().mockRejectedValueOnce(rateLimited).mockResolvedValue('query-ok');
    await expect(
      client.fetchQuery({ queryFn: query, queryKey: ['actual-query-retry'] }),
    ).resolves.toBe('query-ok');
    expect(query).toHaveBeenCalledTimes(2);

    const idempotentError = new PlgApiError(
      503,
      { code: 'BUSY', messageKey: 'errors.busy' },
      { requestWasIdempotent: true, retryAfterMs: 1 },
    );
    const idempotentMutation = vi
      .fn()
      .mockRejectedValueOnce(idempotentError)
      .mockResolvedValue('mutation-ok');
    await expect(
      client
        .getMutationCache()
        .build(client, { mutationFn: idempotentMutation })
        .execute(undefined),
    ).resolves.toBe('mutation-ok');
    expect(idempotentMutation).toHaveBeenCalledTimes(2);

    const ordinaryMutation = vi.fn().mockRejectedValue(rateLimited);
    await expect(
      client.getMutationCache().build(client, { mutationFn: ordinaryMutation }).execute(undefined),
    ).rejects.toBe(rateLimited);
    expect(ordinaryMutation).toHaveBeenCalledOnce();
    client.clear();
  });

  it('reads both supported CSRF cookie names', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      value: '__Host-plg_csrf=stale-secure-value; plg_csrf=csrf-value',
    });
    expect(readCsrfToken()).toBe('csrf-value');
  });

  it('resolves browser rewrites and direct server API URLs', () => {
    const environment = { API_INTERNAL_URL: 'http://api:3001/api/v1' };
    expect(resolveApiOrigin(environment)).toBe('http://api:3001');
    expect(resolveServerApiUrl(environment)).toBe('http://api:3001/api/v1');
  });
});
