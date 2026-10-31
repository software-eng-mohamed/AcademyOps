import type { Request, Response } from 'express';

const METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE = /^(?:[0-9a-f]{16,}|[a-z0-9_-]{24,}|[^.]+\.[^.]+\.[^.]+)$/i;

type RouteRequest = Pick<Request, 'method'> & {
  baseUrl?: string;
  route?: { path?: unknown };
};

export type HttpMetricLabels = {
  method: string;
  route: string;
  status: string;
};

export function httpMetricLabels(
  request: RouteRequest,
  response: Pick<Response, 'statusCode'>,
): HttpMetricLabels {
  const routePath = typeof request.route?.path === 'string' ? request.route.path : '';
  const baseUrl = typeof request.baseUrl === 'string' ? request.baseUrl : '';
  return {
    method: METHODS.has(request.method.toUpperCase()) ? request.method.toUpperCase() : 'OTHER',
    route: routePath ? normalizeRouteTemplate(`${baseUrl}${routePath}`) : '/unmatched',
    status: statusClass(response.statusCode),
  };
}

export function normalizeRouteTemplate(value: string): string {
  const path = value.split(/[?#]/, 1)[0] ?? '';
  const segments = path.split('/').filter(Boolean).slice(0, 20);
  if (!segments.length) return '/';
  const normalized = segments.map((segment) => {
    if (segment.startsWith(':') || segment.startsWith('{')) return ':param';
    if (segment.startsWith('*')) return ':wildcard';
    if (/^\d+$/.test(segment) || UUID.test(segment)) return ':id';
    if (OPAQUE.test(segment)) return ':token';
    if (/^[a-z0-9_.~-]{1,48}$/i.test(segment)) return segment.toLowerCase();
    return ':segment';
  });
  return `/${normalized.join('/')}`.slice(0, 180);
}

function statusClass(statusCode: number): string {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) return 'other';
  return `${Math.floor(statusCode / 100)}xx`;
}
