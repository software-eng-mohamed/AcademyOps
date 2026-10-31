import {
  audit,
  bump,
  type DemoContext,
  failure,
  find,
  json,
  notFound,
  page,
  records,
  timestamp,
  unsupported,
} from './shared';

export function handleImportRoute(ctx: DemoContext): Response | null {
  const { path, state, method, url } = ctx;
  if (path[0] !== 'imports' || path[1] !== 'batches') return null;
  if (method === 'GET' && path.length === 2) return page(records(state, 'imports'), url);
  const item = find(state, 'imports', path[2]);
  if (!item) return method === 'POST' && path.length === 2 ? unsupported() : notFound();
  if (method === 'GET' && path.length === 3) return json(item);
  if (method === 'GET' && path[3] === 'issues')
    return page(
      records(state, 'importIssues').filter((issue) => issue.batchId === item.id),
      url,
    );
  if (method !== 'POST') return unsupported();
  if (item.status === 'FINALIZED') return failure('IMPORT_ALREADY_FINALIZED', 409);
  const action = path[3];
  if (action === 'validate') {
    bump(item, { status: 'VALIDATED' });
    audit(state, 'import.validated', item, 'IMPORT_BATCH');
    return json({ batchId: item.id, dispositions: item.dispositions, openIssues: 0 }, 201);
  }
  if (action === 'reconcile') {
    if (item.status !== 'VALIDATED' && item.status !== 'RECONCILED')
      return failure('IMPORT_INVALID_STATE', 409);
    bump(item, { status: 'RECONCILED', reconciliation: [] });
    audit(state, 'import.reconciled', item, 'IMPORT_BATCH');
    return json({ batchId: item.id, passed: true, metrics: [] }, 201);
  }
  if (action === 'finalize') {
    if (item.status !== 'RECONCILED' || item.openIssues !== 0)
      return failure('IMPORT_INVALID_STATE', 409);
    bump(item, { status: 'FINALIZED', finalizedAt: timestamp(), finalizedBy: 'synthetic-demo' });
    audit(state, 'import.finalized', item, 'IMPORT_BATCH');
    return json({ id: item.id, status: 'FINALIZED', metrics: [] }, 201);
  }
  return unsupported();
}
