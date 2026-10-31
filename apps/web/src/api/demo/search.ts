import {
  type DemoContext,
  type DemoRecord,
  type DemoState,
  find,
  json,
  notFound,
  records,
  string,
} from './shared';

const kinds: Record<string, string> = {
  STUDENT: 'students',
  LEAD: 'leads',
  COHORT: 'cohorts',
  PAYMENT: 'payments',
  INVOICE: 'invoices',
  RECEIPT: 'receipts',
  SESSION: 'sessions',
  CERTIFICATE: 'certificates',
  BUSINESS_ACCOUNT: 'businessAccounts',
};
function result(state: DemoState, type: string, item: DemoRecord) {
  const person = type === 'LEAD' ? find(state, 'people', item.personId) : undefined;
  const label =
    string(
      item.name ||
        person?.name ||
        item.displayName ||
        item.serialNumber ||
        item.serial ||
        item.externalReference ||
        item.code,
    ) || item.id.slice(-8);
  return {
    id: item.id,
    entityType: type,
    labelEn: label,
    labelAr: label,
    secondary: string(item.publicId || item.code || item.amount) || null,
    status: item.status ?? item.state ?? null,
  };
}
export function handleSearchRoute(ctx: DemoContext): Response | null {
  if (ctx.path[0] !== 'search') return null;
  const { state, method, body } = ctx;
  if (method === 'POST' && ctx.path[1] === 'recent') {
    const type = string(body.entityType);
    const item = find(state, kinds[type] ?? '', body.entityId);
    if (!item) return notFound();
    const entry = result(state, type, item);
    state.collections.recentSearch = [
      entry,
      ...records(state, 'recentSearch').filter((previous) => previous.id !== entry.id),
    ].slice(0, 8);
    return new Response(null, { status: 204 });
  }
  if (method !== 'GET') return null;
  const query = (ctx.url.searchParams.get('q') ?? ctx.url.searchParams.get('query') ?? '')
    .trim()
    .toLowerCase();
  const items =
    query.length < 2
      ? []
      : Object.entries(kinds)
          .flatMap(([type, collection]) =>
            records(state, collection)
              .map((item) => result(state, type, item))
              .filter((item) =>
                `${item.labelEn} ${item.secondary ?? ''}`.toLowerCase().includes(query),
              )
              .slice(0, 5),
          )
          .slice(0, 20);
  return json({ items, recent: records(state, 'recentSearch'), query: query || null });
}
