export type DemoRecord = Record<string, unknown> & { id: string };
export type DemoState = {
  collections: Record<string, DemoRecord[]>;
  locale: 'ar' | 'en';
  sequence: number;
  authenticated: boolean;
};
export type DemoContext = {
  state: DemoState;
  method: string;
  path: string[];
  url: URL;
  body: Record<string, unknown>;
  request: Request;
};
export const demoId = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
export const organizationId = demoId(1);
export const branchId = demoId(2);
export const ownerId = demoId(3);
export function timestamp(dayOffset = 0, hour = 9) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + dayOffset);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}
export function baseRecord(id: string, values: Record<string, unknown> = {}): DemoRecord {
  return {
    id,
    organizationId,
    createdAt: timestamp(-30),
    updatedAt: timestamp(),
    version: 1,
    ...values,
  };
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export function failure(code: string, status = 400, messageKey = 'validation.failed') {
  return json({ code, messageKey, correlationId: 'synthetic-demo' }, status);
}
export const invalid = () => failure('DEMO_VALIDATION_FAILED');
export const notFound = () => failure('NOT_FOUND', 404, 'errors.notFound');
export const unsupported = () => failure('DEMO_ACTION_UNAVAILABLE', 422, 'demo.actionUnavailable');
export function records(state: DemoState, name: string) {
  return state.collections[name] ?? [];
}
export function find(state: DemoState, name: string, id: unknown) {
  return records(state, name).find((item) => item.id === id);
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function string(value: unknown) {
  return typeof value === 'string' ? value : '';
}
export function required(value: unknown, maxLength = 160) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}
export function money(cents: number) {
  return (cents / 100).toFixed(2);
}
export function cents(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) ? amount : null;
}
export function nextId(state: DemoState) {
  state.sequence += 1;
  return demoId(state.sequence);
}
export function bump(item: DemoRecord, values: Record<string, unknown>) {
  Object.assign(item, values, { version: Number(item.version ?? 0) + 1, updatedAt: timestamp() });
  return item;
}
export function versionConflict(context: DemoContext, item: DemoRecord) {
  const expected = context.request.headers.get('if-match')?.replaceAll('"', '');
  return expected !== undefined && expected !== null && expected !== String(item.version)
    ? failure('VERSION_CONFLICT', 409, 'concurrency.versionConflict')
    : null;
}
export function page(items: DemoRecord[], url: URL) {
  const search = url.searchParams.get('search')?.toLocaleLowerCase().trim();
  const filtered = items.filter((item) => {
    if (search && !JSON.stringify(item).toLocaleLowerCase().includes(search)) return false;
    for (const key of [
      'status',
      'state',
      'cohortId',
      'studentPersonId',
      'programVersionId',
      'branchId',
    ]) {
      const value = url.searchParams.get(key);
      if (value && item[key] !== value) return false;
    }
    return true;
  });
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 25));
  const offset = Math.max(
    0,
    Number(url.searchParams.get('cursor')) ||
      ((Number(url.searchParams.get('page')) || 1) - 1) * limit,
  );
  return json({
    items: filtered.slice(offset, offset + limit),
    nextCursor: offset + limit < filtered.length ? String(offset + limit) : null,
    total: filtered.length,
    pages: Math.max(1, Math.ceil(filtered.length / limit)),
  });
}
export function audit(state: DemoState, action: string, item: DemoRecord, entityType: string) {
  const entry = baseRecord(nextId(state), {
    action,
    entityType,
    entityId: item.id,
    actor: { id: ownerId, name: 'Demo Owner' },
    actorUserId: ownerId,
    metadata: { synthetic: true },
    createdAt: timestamp(),
  });
  state.collections['audit-events'] ??= [];
  state.collections['audit-events'].unshift(entry);
}
