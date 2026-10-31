import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RequestHandler } from 'express';

type RouteTemplate = {
  key: string;
  method: string;
  pattern: RegExp;
};

const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const templates = readRouteTemplates();
const observedRouteKeys = new Set<string>();
const unmatchedRouteKeys = new Set<string>();

export const recordHttpTestRoute: RequestHandler = (request, _response, next) => {
  const path = request.originalUrl.split('?', 1)[0] ?? request.path;
  const template = templates.find(
    ({ method, pattern }) => method === request.method && pattern.test(path),
  );
  if (template) observedRouteKeys.add(template.key);
  else unmatchedRouteKeys.add(`${request.method} ${path}`);
  next();
};

export function recordedHttpTestRoutes(): {
  observed: string[];
  unmatched: string[];
} {
  return {
    observed: [...observedRouteKeys].sort(),
    unmatched: [...unmatchedRouteKeys].sort(),
  };
}

function readRouteTemplates(): RouteTemplate[] {
  const spec = JSON.parse(
    readFileSync(resolve('../../packages/api-client/openapi.json'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, unknown>>;
  };
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((method) => methods.has(method))
      .map((method) => ({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        pattern: routePattern(path),
      })),
  );
}

function routePattern(path: string): RegExp {
  const segments = path
    .split('/')
    .map((segment) =>
      /^\{[^/]+\}$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
  return new RegExp(`^${segments.join('/')}$`);
}
