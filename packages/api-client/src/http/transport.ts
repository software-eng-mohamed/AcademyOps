import { abortReason, createRequestSignal } from './abort.js';
import { PlgApiError, type PlgApiErrorOptions } from './error.js';
import { readApiErrorPayload, readPlgResponse } from './response.js';
import type {
  FetchImplementation,
  PlgRequestInit,
  PlgRequestMetadata,
  PlgTransportOptions,
} from './types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function joinUrl(baseUrl: string, input: RequestInfo | URL): RequestInfo | URL {
  if (input instanceof Request || input instanceof URL) return input;
  if (/^https?:\/\//i.test(input)) return input;
  return `${baseUrl.replace(/\/$/, '')}/${input.replace(/^\//, '')}`;
}

export function safeRandomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class PlgHttpTransport {
  private readonly fetchImplementation: FetchImplementation;
  private readonly responseMetadata = new WeakMap<Response, PlgApiErrorOptions>();

  constructor(private readonly options: PlgTransportOptions) {
    this.fetchImplementation = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async fetch(input: RequestInfo | URL, init: PlgRequestInit = {}): Promise<Response> {
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = this.buildHeaders(method, input, init);
    const timeoutMs = Math.max(1, init.timeoutMs ?? this.options.timeoutMs ?? 15_000);
    const metadata: PlgRequestMetadata = {
      requestMethod: method,
      requestWasIdempotent: this.hasHeader(headers, 'idempotency-key'),
    };

    if (init.signal?.aborted) throw abortReason(init.signal);
    const requestSignal = createRequestSignal(init.signal ?? undefined, timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImplementation(joinUrl(this.options.baseUrl, input), {
        ...this.nativeRequestInit(init),
        cache: init.cache ?? 'no-store',
        credentials: init.credentials ?? 'include',
        headers,
        signal: requestSignal.signal,
      });
    } catch (error) {
      if (init.signal?.aborted) throw abortReason(init.signal);
      const timeout = requestSignal.timedOut();
      throw new PlgApiError(
        0,
        {
          code: timeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
          messageKey: timeout ? 'errors.requestTimeout' : 'errors.networkError',
        },
        { ...metadata, cause: error },
      );
    } finally {
      requestSignal.cleanup();
    }
    this.responseMetadata.set(response, metadata);
    if (response.status === 401 && !init.allowUnauthorized) {
      const authError = new PlgApiError(401, await readApiErrorPayload(response.clone()), metadata);
      this.options.onUnauthorized?.(authError);
    }
    return response;
  }

  async request<T>(input: RequestInfo | URL, init: PlgRequestInit = {}): Promise<T> {
    const response = await this.fetch(input, init);
    if (init.allowUnauthorized && response.status === 401) return null as T;
    return this.read<T>(response);
  }

  read<T>(response: Response): Promise<T> {
    return readPlgResponse<T>(response, this.responseMetadata.get(response));
  }

  private buildHeaders(
    method: string,
    input: RequestInfo | URL,
    init: PlgRequestInit,
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    if (input instanceof Request) {
      input.headers.forEach((value, key) => {
        headers[key] = value;
      });
    }
    this.copyHeaders(headers, init.headers);
    if (!this.hasHeader(headers, 'accept')) headers.Accept = 'application/json';
    if (this.options.cookie && !this.hasHeader(headers, 'cookie')) {
      headers.Cookie = this.options.cookie;
    }
    if (init.idempotencyKey && !this.hasHeader(headers, 'idempotency-key')) {
      headers['Idempotency-Key'] = init.idempotencyKey;
    }
    if (!this.hasHeader(headers, 'x-correlation-id')) {
      headers['x-correlation-id'] = this.options.correlationIdFactory?.() ?? safeRandomUuid();
    }
    if (!SAFE_METHODS.has(method) && !this.hasHeader(headers, 'x-csrf-token')) {
      const csrfToken = this.options.getCsrfToken?.();
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
    }
    return headers;
  }

  private copyHeaders(target: Record<string, string>, source: HeadersInit | undefined) {
    if (!source) return;
    if (source instanceof Headers || Array.isArray(source)) {
      new Headers(source).forEach((value, key) => {
        target[key] = value;
      });
      return;
    }
    for (const [key, value] of Object.entries(source)) target[key] = value;
  }

  private hasHeader(headers: Record<string, string>, name: string) {
    return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
  }

  private nativeRequestInit(init: PlgRequestInit): RequestInit {
    const { allowUnauthorized, idempotencyKey, timeoutMs, ...requestInit } = init;
    void allowUnauthorized;
    void idempotencyKey;
    void timeoutMs;
    return requestInit;
  }
}

export function createPlgFetch(options: PlgTransportOptions) {
  const transport = new PlgHttpTransport(options);
  return <T>(input: RequestInfo | URL, init?: PlgRequestInit) => transport.request<T>(input, init);
}
