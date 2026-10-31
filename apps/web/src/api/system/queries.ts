import { field, record, textValue } from '@/api/academy/models';
import * as audit from '@/api/generated/audit/audit';
import * as branches from '@/api/generated/branches/branches';
import * as imports from '@/api/generated/imports/imports';
import * as roles from '@/api/generated/roles/roles';
import * as users from '@/api/generated/users/users';
import type { SystemRecord, SystemResource } from '@/features/system/config';
import { cairoDayRange } from '@/lib/cairo-time';

export const systemKey = (userId: string) => ['owner-system', userId] as const;
export function systemRecord(value: unknown): SystemRecord {
  const data = record(value);
  if (typeof data.id !== 'string' || !data.id) throw new Error('Invalid system record');
  return { ...data, id: data.id };
}
export function systemName(resource: SystemResource, item: SystemRecord): string {
  if (resource === 'users') return textValue(item.name || item.publicId) || item.id.slice(0, 8);
  if (resource === 'imports') {
    const source = Array.isArray(item.sources) ? record(item.sources[0]) : {};
    return textValue(source.originalName || item.name || item.id.slice(0, 8));
  }
  if (resource === 'audit') return textValue(item.action);
  if (resource === 'legacyArchive') return textValue(item.sourceFileName || item.sheetName);
  return textValue(item.name || item.code);
}
export type SystemFilters = {
  cursor?: string;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  entityType?: string;
  category?: string;
};
export type SystemPageData = { items: SystemRecord[]; nextCursor: string | null };
export function systemPageData(value: unknown): SystemPageData {
  const data = record(value);
  return {
    items: Array.isArray(data.items) ? data.items.map(systemRecord) : [],
    nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
  };
}
export async function getSystemPage(
  resource: SystemResource,
  filters: SystemFilters,
  signal?: AbortSignal,
): Promise<SystemPageData> {
  const request = { signal: signal ?? null };
  const cursor = filters.cursor ? { cursor: filters.cursor } : {};
  const common = { ...cursor, ...(filters.search ? { search: filters.search } : {}) };
  let data: unknown;
  switch (resource) {
    case 'users':
      data = (
        await users.usersControllerListV1(
          {
            ...common,
            ...(['PENDING', 'ACTIVE', 'SUSPENDED'].includes(filters.status ?? '')
              ? { status: filters.status as 'PENDING' | 'ACTIVE' | 'SUSPENDED' }
              : {}),
          },
          request,
        )
      ).data;
      break;
    case 'roles':
      data = (await roles.rolesControllerListV1(common, request)).data;
      break;
    case 'branches':
      data = (await branches.branchesControllerListV1(common, request)).data;
      break;
    case 'imports':
      data = (
        await imports.importsControllerListV1(
          {
            ...cursor,
            ...(['STAGED', 'VALIDATED', 'RECONCILED', 'FINALIZED'].includes(filters.status ?? '')
              ? { status: filters.status as 'STAGED' | 'VALIDATED' | 'RECONCILED' | 'FINALIZED' }
              : {}),
          },
          request,
        )
      ).data;
      break;
    case 'audit': {
      const from = filters.from ? cairoDayRange(filters.from).from : undefined;
      const to = filters.to ? cairoDayRange(filters.to).to : undefined;
      data = (
        await audit.auditControllerListV1(
          {
            ...cursor,
            ...(filters.search ? { action: filters.search } : {}),
            ...(filters.entityType ? { entityType: filters.entityType } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          },
          request,
        )
      ).data;
      break;
    }
    case 'legacyArchive':
      data = (
        await imports.legacyArchiveControllerListV1(
          {
            ...cursor,
            ...(filters.search ? { sheetName: filters.search } : {}),
            ...(filters.category ? { category: filters.category } : {}),
          },
          request,
        )
      ).data;
      break;
  }
  return systemPageData(data);
}
export async function getSystemDetail(
  resource: SystemResource,
  id: string,
  signal?: AbortSignal,
): Promise<SystemRecord> {
  const request = { signal: signal ?? null };
  const operations = {
    users: users.usersControllerReadV1,
    roles: roles.rolesControllerReadV1,
    branches: branches.branchesControllerReadV1,
    imports: imports.importsControllerDetailV1,
    audit: audit.auditControllerReadV1,
    legacyArchive: imports.legacyArchiveControllerReadV1,
  };
  return systemRecord((await operations[resource](id, request)).data);
}
export async function getImportIssues(
  id: string,
  status: 'OPEN' | 'RESOLVED' | 'IGNORED',
  cursor?: string,
  signal?: AbortSignal,
) {
  return systemPageData(
    (
      await imports.importsControllerIssuesV1(
        id,
        { status, ...(cursor ? { cursor } : {}) },
        { signal: signal ?? null },
      )
    ).data,
  );
}
export function systemField(item: SystemRecord, name: string): unknown {
  if (name === 'email')
    return Array.isArray(item.identifiers)
      ? item.identifiers.map(record).find((entry) => entry.type === 'EMAIL')?.normalizedValue
      : undefined;
  return field(item, name);
}
