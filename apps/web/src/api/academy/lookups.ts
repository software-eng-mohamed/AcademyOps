import {
  programsControllerReadV1,
  programVersionsControllerReadV1,
} from '@/api/generated/academic-catalog/academic-catalog';
import { cohortsControllerReadV1 } from '@/api/generated/academic-cohorts/academic-cohorts';
import { businessAccountsControllerListV1 } from '@/api/generated/business-accounts/business-accounts';
import type { LookupKind } from '@/features/academy/actions';
import { record, records, textValue } from './models';
import { getAcademyPage, getAssignees } from './queries';

export type LookupOption = { value: string; label: string; status?: string; version?: string };
export type LookupContext = {
  branchId?: string;
  programId?: string;
  programVersionId?: string;
  cohortId?: string;
  programVersionModuleId?: string;
  excludeId?: string;
};
export async function getLookupPage(
  kind: LookupKind,
  search: string,
  cursor: string | undefined,
  context: LookupContext,
  signal?: AbortSignal,
): Promise<{ items: LookupOption[]; nextCursor: string | null }> {
  if (kind === 'publishedVersions') {
    if (!context.programId) return { items: [], nextCursor: null };
    const data = (await programsControllerReadV1(context.programId, { signal: signal ?? null }))
      .data;
    return {
      items: data.versions
        .filter((item) => item.status === 'PUBLISHED')
        .map((item) => ({ value: item.id, label: data.name, version: String(item.version) })),
      nextCursor: null,
    };
  }
  if (kind === 'curriculumModules') {
    if (!context.programVersionId) return { items: [], nextCursor: null };
    const data = (
      await programVersionsControllerReadV1(context.programVersionId, { signal: signal ?? null })
    ).data;
    return {
      items: data.modules.map((item) => ({
        value: item.id,
        label: textValue(record(item.module).name),
      })),
      nextCursor: null,
    };
  }
  if (kind === 'cohortModules') {
    if (!context.cohortId || !context.programVersionModuleId)
      return { items: [], nextCursor: null };
    const data = (await cohortsControllerReadV1(context.cohortId, { signal: signal ?? null })).data;
    return {
      items: data.modules
        .filter((item) => item.programVersionModuleId === context.programVersionModuleId)
        .map((item) => ({ value: item.id, label: textValue(record(item.module).name) })),
      nextCursor: null,
    };
  }
  if (kind === 'assignees') {
    if (!context.branchId) return { items: [], nextCursor: null };
    return {
      items: (await getAssignees(context.branchId, search, signal)).map((item) => ({
        value: item.id,
        label: item.name,
      })),
      nextCursor: null,
    };
  }
  if (kind === 'businessAccounts') {
    const result = (
      await businessAccountsControllerListV1(
        { ...(search ? { search } : {}), ...(cursor ? { cursor } : {}), status: 'ACTIVE' },
        { signal: signal ?? null },
      )
    ).data;
    return {
      items: records(record(result).items).map((item) => ({
        value: textValue(item.id),
        label: textValue(item.displayName || item.legalName),
      })),
      nextCursor: textValue(record(result).nextCursor) || null,
    };
  }
  const data = await getAcademyPage(kind, { search, ...(cursor ? { cursor } : {}) }, signal);
  return {
    items: data.items
      .filter((item) => item.id !== context.excludeId)
      .map((item) => ({
        value: item.id,
        label: [item.name, item.code]
          .filter(Boolean)
          .filter((item, index, all) => all.indexOf(item) === index)
          .join(' · '),
        status: kind === 'cohorts' ? textValue(item.data.intakeStatus) || item.status : item.status,
      })),
    nextCursor: data.nextCursor,
  };
}
