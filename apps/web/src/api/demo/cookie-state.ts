import { object } from './shared';

export const DEMO_COOKIE = 'academyops_demo';
export const MAX_DEMO_COOKIE = 3600;
export type DemoEvent = {
  m: string;
  p: string;
  b: Record<string, unknown>;
  v?: string;
  k?: string;
};
export type DemoEnvelope = { v: 1; a: boolean; l: 'en' | 'ar'; e: DemoEvent[] };
export const emptyEnvelope = (): DemoEnvelope => ({ v: 1, a: false, l: 'en', e: [] });

export function safeValue(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e9;
  if (typeof value === 'string') return value.length <= 1000;
  if (Array.isArray(value))
    return value.length <= 40 && value.every((entry) => safeValue(entry, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 35 &&
    entries.every(
      ([key, item]) =>
        key.length <= 80 &&
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        safeValue(item, depth + 1),
    )
  );
}
function validEvent(value: unknown): value is DemoEvent {
  const event = object(value);
  return (
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(String(event.m)) &&
    typeof event.p === 'string' &&
    event.p.length <= 240 &&
    /^[a-zA-Z0-9_/-]+$/.test(event.p) &&
    !event.p.startsWith('auth/') &&
    !event.p.startsWith('demo/') &&
    event.b !== null &&
    typeof event.b === 'object' &&
    !Array.isArray(event.b) &&
    safeValue(event.b) &&
    (event.v === undefined || (typeof event.v === 'string' && /^\d{1,8}$/.test(event.v))) &&
    (event.k === undefined || (typeof event.k === 'string' && /^[\w-]{1,100}$/.test(event.k))) &&
    Object.keys(event).every((key) => ['m', 'p', 'b', 'v', 'k'].includes(key))
  );
}
export function decodeEnvelope(request: Request): DemoEnvelope {
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${DEMO_COOKIE}=`))
    ?.slice(DEMO_COOKIE.length + 1);
  if (!raw || raw.length > MAX_DEMO_COOKIE) return emptyEnvelope();
  try {
    const normalized = decodeURIComponent(raw).replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
    );
    const parsed: unknown = JSON.parse(decoded);
    const candidate = object(parsed);
    if (
      candidate.v !== 1 ||
      typeof candidate.a !== 'boolean' ||
      !['en', 'ar'].includes(String(candidate.l)) ||
      !Array.isArray(candidate.e) ||
      candidate.e.length > 24 ||
      !candidate.e.every(validEvent) ||
      !Object.keys(candidate).every((key) => ['v', 'a', 'l', 'e'].includes(key))
    )
      return emptyEnvelope();
    return candidate as DemoEnvelope;
  } catch {
    return emptyEnvelope();
  }
}
export function encodeEnvelope(envelope: DemoEnvelope) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(envelope))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 12000) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  if (!size) return {};
  if (!request.headers.get('content-type')?.includes('application/json')) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return result && typeof result === 'object' && !Array.isArray(result) && safeValue(result)
      ? object(result)
      : null;
  } catch {
    return null;
  }
}
