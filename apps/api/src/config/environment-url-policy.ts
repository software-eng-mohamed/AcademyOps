import type { z } from 'zod';

export function enforceSecureUrl(
  value: string,
  field: string,
  originOnly: boolean,
  context: z.RefinementCtx,
): void {
  const url = new URL(value);
  const isIpOrLocal =
    ['127.0.0.1', 'localhost', 'caddy'].includes(url.hostname) ||
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      url.hostname,
    );
  if (url.protocol !== 'https:' && !isIpOrLocal) {
    context.addIssue({ code: 'custom', path: [field], message: `${field} must use HTTPS` });
  }
  if (url.username || url.password) {
    context.addIssue({
      code: 'custom',
      path: [field],
      message: `${field} must not contain credentials`,
    });
  }
  if (originOnly && (url.pathname !== '/' || url.search || url.hash)) {
    context.addIssue({
      code: 'custom',
      path: [field],
      message: `${field} must contain only an origin`,
    });
  }
}

export function enforceInternalConnectorUrl(value: string, context: z.RefinementCtx): void {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== 'otp-connector' ||
    url.port !== '3002' ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    context.addIssue({
      code: 'custom',
      path: ['OTP_CONNECTOR_URL'],
      message: 'OTP_CONNECTOR_URL must be the private http://otp-connector:3002 origin',
    });
  }
}
