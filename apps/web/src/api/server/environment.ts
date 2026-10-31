const LOCAL_API_ORIGIN = 'http://localhost:3001';
type ApiEnvironment = Readonly<Record<string, string | undefined>>;

function validateOrigin(name: string, value: string, production: boolean): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTP(S) origin without a path, query, or hash`);
  }
  const loopback =
    ['127.0.0.1', '::1', 'localhost', 'caddy'].includes(url.hostname) ||
    url.hostname.startsWith('10.') ||
    url.hostname.startsWith('172.') ||
    url.hostname.endsWith('.internal');
  const isIp =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      url.hostname,
    );
  if (production && url.protocol !== 'https:' && !loopback && !isIp) {
    throw new Error(`${name} must use HTTPS outside local development`);
  }
  return url.origin;
}

export function resolveApiOrigin(environment: ApiEnvironment = process.env): string {
  const production = environment.NODE_ENV === 'production';
  const internal = environment.API_INTERNAL_URL?.trim();
  if (internal) {
    const url = new URL(internal);
    if (url.pathname.replace(/\/$/, '') !== '/api/v1' || url.search || url.hash) {
      throw new Error('API_INTERNAL_URL must end at /api/v1 without query or hash');
    }
    return validateOrigin('API_INTERNAL_URL', url.origin, production);
  }
  return validateOrigin(
    'API_ORIGIN',
    environment.API_ORIGIN?.trim() || LOCAL_API_ORIGIN,
    production,
  );
}

export function resolveServerApiUrl(environment: ApiEnvironment = process.env): string {
  const internal = environment.API_INTERNAL_URL?.trim();
  if (internal) {
    resolveApiOrigin(environment);
    return internal.replace(/\/$/, '');
  }
  return `${resolveApiOrigin(environment)}/api/v1`;
}
