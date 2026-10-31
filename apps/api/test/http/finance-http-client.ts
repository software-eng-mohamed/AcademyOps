import type { HttpTestContext } from './http-test-harness';

export function get(context: HttpTestContext, path: string): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/${path}`, { headers: context.safeHeaders });
}

export function mutate(
  context: HttpTestContext,
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/${path}`, {
    method,
    headers: {
      ...context.unsafeHeaders,
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function post(
  context: HttpTestContext,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return mutate(context, 'POST', path, body, headers);
}

export function put(
  context: HttpTestContext,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return mutate(context, 'PUT', path, body, headers);
}

export function patch(
  context: HttpTestContext,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return mutate(context, 'PATCH', path, body, headers);
}
