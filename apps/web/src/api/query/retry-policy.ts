import { isAbortError, isPlgApiError, isRetryableError } from '@academyops/api-client/http';

const MAX_RETRIES = 1;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10_000;

export function queryRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES || isAbortError(error)) return false;
  return isRetryableError(error);
}

export function hasIdempotencyKey(error: unknown): boolean {
  return isPlgApiError(error) && error.requestWasIdempotent;
}

export function mutationRetry(failureCount: number, error: unknown): boolean {
  return hasIdempotencyKey(error) && queryRetry(failureCount, error);
}

export function queryRetryDelay(
  failureCount: number,
  error: unknown,
  random: () => number = Math.random,
): number {
  if (isPlgApiError(error) && error.retryAfterMs !== undefined) return error.retryAfterMs;
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** failureCount);
  const jitter = 0.8 + random() * 0.4;
  return Math.round(exponential * jitter);
}
