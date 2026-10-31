import {
  audit,
  baseRecord,
  bump,
  type DemoContext,
  failure,
  find,
  invalid,
  json,
  nextId,
  notFound,
  object,
  page,
  records,
  required,
  string,
  timestamp,
  unsupported,
  versionConflict,
} from './shared';
import { handleCertificateRoute } from './system-certificates';
import { handleImportRoute } from './system-imports';

const collections: Record<string, string> = {
  users: 'users',
  roles: 'roles',
  branches: 'branches',
  'audit-events': 'audit-events',
  'legacy-archive': 'legacyArchive',
};
export function handleSystemRoute(ctx: DemoContext): Response | null {
  const { path, state, method, body, url } = ctx;
  const specialized = handleCertificateRoute(ctx) ?? handleImportRoute(ctx);
  if (specialized) return specialized;
  const collection = collections[path[0] ?? ''];
  if (!collection) return null;
  if (method === 'GET' && path.length === 1) return page(records(state, collection), url);
  if (
    method === 'POST' &&
    path.length === 1 &&
    ['branches', 'roles', 'users'].includes(collection)
  ) {
    if (!required(body.name)) return invalid();
    if (
      collection !== 'users' &&
      (!required(body.code, 50) || !/^[A-Za-z0-9_-]+$/.test(string(body.code)))
    )
      return invalid();
    if (collection !== 'users' && records(state, collection).some((row) => row.code === body.code))
      return failure('DUPLICATE_CODE', 409);
    let values: Record<string, unknown> = { name: body.name, code: body.code, isActive: true };
    if (collection === 'roles') {
      if (!validGrants(body.grants)) return invalid();
      values = { name: body.name, code: body.code, grants: body.grants, isSystem: false };
    }
    if (collection === 'users') {
      if (!required(body.email, 320) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(string(body.email)))
        return invalid();
      const roleRows = selectedRows(ctx, 'roles', body.roleIds);
      const branchRows = selectedRows(ctx, 'branches', body.branchIds);
      if (!roleRows || !branchRows) return invalid();
      values = {
        name: body.name,
        publicId: `AO-DEMO-${state.sequence + 1}`,
        status: 'ACTIVE',
        preferredLocale: body.preferredLocale ?? 'en',
        employeeCode: body.employeeCode ?? null,
        roles: roleRows,
        branches: branchRows,
        identifiers: [{ type: 'EMAIL', normalizedValue: body.email, verifiedAt: timestamp() }],
      };
    }
    const item = baseRecord(nextId(state), values);
    records(state, collection).push(item);
    audit(state, `${path[0]}.created`, item, collection.toUpperCase());
    return json(item, 201);
  }
  const item = find(state, collection, path[1]);
  if (!item) return method === 'GET' ? notFound() : unsupported();
  if (method === 'GET' && path.length === 2) return json(item);
  const conflict = versionConflict(ctx, item);
  if (conflict) return conflict;
  if (method === 'PATCH' && collection === 'users' && path[2] === 'status') {
    if (!['ACTIVE', 'SUSPENDED', 'PENDING'].includes(string(body.status))) return invalid();
    return json(bump(item, { status: body.status }));
  }
  if (method === 'PATCH' && collection === 'branches' && path.length === 2) {
    if (!required(body.name) || typeof body.isActive !== 'boolean') return invalid();
    return json(bump(item, { name: body.name, isActive: body.isActive }));
  }
  if (method === 'PATCH' && collection === 'roles' && path.length === 2) {
    if (!required(body.name)) return invalid();
    return json(bump(item, { name: body.name }));
  }
  if (method === 'PUT' && collection === 'roles' && path[2] === 'grants') {
    if (!validGrants(body.grants)) return invalid();
    return json(bump(item, { grants: body.grants }));
  }
  if (method === 'PUT' && collection === 'users' && ['roles', 'branches'].includes(path[2] ?? '')) {
    const selected = selectedRows(ctx, path[2] ?? '', body.ids);
    if (!selected || !required(body.reason, 1000)) return invalid();
    return json(bump(item, { [path[2] ?? '']: selected }));
  }
  return unsupported();
}

function selectedRows(ctx: DemoContext, collection: string, ids: unknown) {
  if (!Array.isArray(ids) || ids.length > 20 || ids.some((id) => typeof id !== 'string'))
    return null;
  const selected = ids.map((id) => find(ctx.state, collection, id));
  return selected.every(Boolean) ? selected : null;
}

function validGrants(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((entry) => {
      const grant = object(entry);
      return (
        required(grant.permissionCode, 100) && ['O', 'B', 'A', 'S'].includes(string(grant.scope))
      );
    })
  );
}
