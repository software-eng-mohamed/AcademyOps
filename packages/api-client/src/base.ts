import createClient from 'openapi-fetch';
import type { paths } from './generated.js';
import { PlgHttpTransport, type PlgRequestInit, type PlgTransportOptions } from './transport.js';

export function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export type PlgApiClientOptions = PlgTransportOptions;

export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class BaseApiClient {
  readonly generated;
  protected readonly transport: PlgHttpTransport;

  constructor(protected readonly options: PlgApiClientOptions) {
    this.transport = new PlgHttpTransport(options);
    this.generated = createClient<paths>({
      baseUrl: options.baseUrl,
      credentials: 'include',
      fetch: (request: Request) => this.transport.fetch(request),
    });
  }

  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headersOrAllowUnauthorized?: Record<string, string> | boolean,
    requestOptions?: RequestOptions,
  ): Promise<T> {
    const allowUnauthorized = headersOrAllowUnauthorized === true;
    const extraHeaders =
      headersOrAllowUnauthorized && typeof headersOrAllowUnauthorized === 'object'
        ? headersOrAllowUnauthorized
        : {};
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const requestInit: PlgRequestInit = {
      method,
      ...(requestOptions?.signal ? { signal: requestOptions.signal } : {}),
      ...(requestOptions?.timeoutMs ? { timeoutMs: requestOptions.timeoutMs } : {}),
      allowUnauthorized,
      headers: {
        ...(body === undefined || isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: isFormData ? body : JSON.stringify(body) }),
    };
    return this.transport.request<T>(path, requestInit);
  }
}
