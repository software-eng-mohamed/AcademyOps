import { academyFixtures } from './academy-fixtures';
import { handleAcademyPricingRoute } from './academy-pricing-routes';
import { handleAcademyRoute } from './academy-routes';
import {
  DEMO_COOKIE,
  type DemoEvent,
  decodeEnvelope,
  encodeEnvelope,
  MAX_DEMO_COOKIE,
  readBody,
} from './cookie-state';
import { handleDashboardRoute } from './dashboard';
import { handleFinanceAdjustments } from './finance-adjustments';
import { financeFixtures } from './finance-fixtures';
import { handleInvoiceActions } from './finance-invoices';
import { handleFinanceRoute } from './finance-routes';
import { financeWorkflowFixtures } from './finance-workflow-fixtures';
import { handleIdentityRoute, identityFixtures } from './identity';
import { handleSearchRoute } from './search';
import { sessionFixtures } from './session-fixtures';
import { handleSessionRoute } from './session-routes';
import { type DemoContext, type DemoState, failure, invalid, json, notFound } from './shared';
import { systemFixtures } from './system-fixtures';
import { handleSystemRoute } from './system-routes';

export function createDemoState(): DemoState {
  const state: DemoState = {
    locale: 'en',
    sequence: 10000,
    authenticated: false,
    collections: { ...identityFixtures(), ...academyFixtures() },
  };
  Object.assign(state.collections, sessionFixtures(state), financeFixtures(state));
  Object.assign(state.collections, financeWorkflowFixtures(state));
  Object.assign(state.collections, systemFixtures(state));
  return state;
}
function dispatch(context: DemoContext): Response {
  if (['auth', 'health'].includes(context.path[0] ?? ''))
    return handleIdentityRoute(context) ?? notFound();
  if (!context.state.authenticated) return failure('UNAUTHORIZED', 401, 'auth.unauthorized');
  if (context.path.join('/') === 'demo/reset' && context.method === 'POST')
    return json({ reset: true });
  return (
    handleSearchRoute(context) ??
    handleIdentityRoute(context) ??
    handleDashboardRoute(context) ??
    handleSessionRoute(context) ??
    handleAcademyPricingRoute(context) ??
    handleFinanceAdjustments(context) ??
    handleInvoiceActions(context) ??
    handleFinanceRoute(context) ??
    handleAcademyRoute(context) ??
    handleSystemRoute(context) ??
    notFound()
  );
}
function eventRequest(event: DemoEvent, origin: string) {
  return new Request(`${origin}/api/v1/${event.p}`, {
    method: event.m,
    headers: {
      ...(event.v ? { 'if-match': event.v } : {}),
      ...(event.k ? { 'idempotency-key': event.k } : {}),
    },
  });
}

/** Rebuilds a fictional academy for one visitor. No network, database or shared mutable state. */
export async function handleDemoRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/v1/')) return notFound();
  const path = url.pathname.slice('/api/v1/'.length).replace(/\/$/, '').split('/');
  if (path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))) return notFound();
  const unsafe = !['GET', 'HEAD'].includes(request.method);
  const origin = request.headers.get('origin');
  if (unsafe && origin && origin !== url.origin) return failure('DEMO_ORIGIN_MISMATCH', 403);
  const body = unsafe ? await readBody(request) : {};
  if (body === null) return invalid();
  let envelope = decodeEnvelope(request);
  let state = createDemoState();
  state.authenticated = envelope.a;
  state.locale = envelope.l;
  const replayed = new Map<string, { event: DemoEvent; response: Response }>();
  for (const event of envelope.e) {
    const replayRequest = eventRequest(event, url.origin);
    const result = dispatch({
      state,
      method: event.m,
      path: event.p.split('/'),
      body: event.b,
      url: new URL(replayRequest.url),
      request: replayRequest,
    });
    if (!result.ok) {
      state = createDemoState();
      state.authenticated = envelope.a;
      state.locale = envelope.l;
      envelope = { ...envelope, e: [] };
      replayed.clear();
      break;
    }
    if (event.k) replayed.set(event.k, { event, response: result });
  }
  const event: DemoEvent = { m: request.method, p: path.join('/'), b: body };
  const version = request.headers.get('if-match')?.replaceAll('"', '');
  const key = request.headers.get('idempotency-key');
  if ((version && !/^\d{1,8}$/.test(version)) || (key && !/^[\w-]{1,100}$/.test(key)))
    return invalid();
  if (version) event.v = version;
  if (key) event.k = key;
  const duplicate = key ? replayed.get(key) : undefined;
  if (duplicate)
    return JSON.stringify(duplicate.event) === JSON.stringify(event)
      ? duplicate.response
      : failure('IDEMPOTENCY_KEY_REUSED', 409);
  const response = dispatch({ state, path, body, url, request, method: request.method });
  if (!unsafe || !response.ok) return response;
  if (path.join('/') === 'demo/reset' || path.join('/') === 'auth/logout') envelope.e = [];
  else if (path[0] !== 'auth') envelope.e.push(event);
  envelope.a = state.authenticated;
  envelope.l = state.locale;
  const encoded = encodeEnvelope(envelope);
  if (encoded.length > MAX_DEMO_COOKIE || envelope.e.length > 24)
    return failure('DEMO_STORAGE_LIMIT', 409, 'demo.storageLimit');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.headers.append(
    'Set-Cookie',
    `${DEMO_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`,
  );
  response.headers.append(
    'Set-Cookie',
    `plg_csrf=academyops-demo; Path=/; SameSite=Lax; Max-Age=86400${secure}`,
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
