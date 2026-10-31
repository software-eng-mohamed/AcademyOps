import type { PlgApiError } from './error.js';

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type PlgApiErrorPayload = {
  code: string;
  correlationId?: string;
  fieldErrors?: Array<{ field: string; messageKey: string }>;
  messageKey: string;
};

export type PlgRequestMetadata = {
  requestMethod: string;
  requestWasIdempotent: boolean;
};

export type PlgTransportOptions = {
  baseUrl: string;
  cookie?: string;
  correlationIdFactory?: () => string;
  fetch?: FetchImplementation;
  getCsrfToken?: () => string | undefined;
  onUnauthorized?: (error: PlgApiError) => void;
  timeoutMs?: number;
};

export type PlgRequestInit = RequestInit & {
  allowUnauthorized?: boolean;
  idempotencyKey?: string;
  timeoutMs?: number;
};
