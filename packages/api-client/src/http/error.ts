import type { PlgApiErrorPayload, PlgRequestMetadata } from './types.js';

export type PlgApiErrorOptions = Partial<PlgRequestMetadata> & {
  attempts?: number;
  cause?: unknown;
  retryAfterMs?: number;
};

export class PlgApiError extends Error {
  readonly attempts: number;
  readonly requestMethod: string | undefined;
  readonly requestWasIdempotent: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(
    readonly status: number,
    readonly payload: PlgApiErrorPayload,
    options: PlgApiErrorOptions = {},
  ) {
    super(payload.messageKey || payload.code, options.cause ? { cause: options.cause } : undefined);
    this.name = 'PlgApiError';
    this.attempts = options.attempts ?? 1;
    this.requestMethod = options.requestMethod;
    this.requestWasIdempotent = options.requestWasIdempotent ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }

  get correlationId() {
    return this.payload.correlationId;
  }

  get retryable() {
    if (this.payload.code === 'RESPONSE_INVALID') return false;
    return this.status === 0 || [408, 425, 429, 500, 502, 503, 504].includes(this.status);
  }
}

export function isPlgApiError(error: unknown): error is PlgApiError {
  return error instanceof PlgApiError;
}

export function isRetryableError(error: unknown): error is PlgApiError {
  return isPlgApiError(error) && error.retryable;
}
