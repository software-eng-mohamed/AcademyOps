import { PlgApiError, type PlgApiErrorOptions } from './error.js';
import { parseRetryAfter } from './retry-after.js';
import type { PlgApiErrorPayload } from './types.js';

function fallbackApiError(status: number, correlationId?: string): PlgApiErrorPayload {
  return {
    code: status === 0 ? 'NETWORK_ERROR' : 'REQUEST_FAILED',
    messageKey: status === 0 ? 'errors.networkError' : 'errors.requestFailed',
    ...(correlationId ? { correlationId } : {}),
  };
}

function isApiErrorPayload(value: unknown): value is PlgApiErrorPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === 'string' && typeof record.messageKey === 'string';
}

export async function readApiErrorPayload(response: Response): Promise<PlgApiErrorPayload> {
  const correlationId = response.headers.get('x-correlation-id') ?? undefined;
  const payload = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (isApiErrorPayload(payload)) {
    return correlationId && !payload.correlationId ? { ...payload, correlationId } : payload;
  }
  return fallbackApiError(response.status, correlationId);
}

export async function readPlgResponse<T>(
  response: Response,
  requestMetadata: PlgApiErrorOptions = {},
): Promise<T> {
  if (!response.ok) {
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    throw new PlgApiError(response.status, await readApiErrorPayload(response), {
      ...requestMetadata,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
  }
  if (response.status === 204 || response.status === 205) return undefined as T;
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const binary =
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/pdf') ||
    contentType.startsWith('image/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/');
  if (binary) return (await response.blob()) as T;
  const body = await response.text();
  if (!body.trim()) return undefined as T;
  return JSON.parse(body) as T;
}
