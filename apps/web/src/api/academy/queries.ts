import * as catalog from '@/api/generated/academic-catalog/academic-catalog';
import * as cohorts from '@/api/generated/academic-cohorts/academic-cohorts';
import * as resources from '@/api/generated/academic-resources/academic-resources';
import * as crm from '@/api/generated/crm/crm';
import * as enrollment from '@/api/generated/enrollment/enrollment';
import { authControllerMeV1 } from '@/api/generated/identity/identity';
import { EnrollmentControllerListV1State } from '@/api/generated/models/enrollmentControllerListV1State';
import { LeadsControllerListV1State } from '@/api/generated/models/leadsControllerListV1State';
import type { ResponseCandidate } from '@/api/generated/models/responseCandidate';
import * as students from '@/api/generated/students/students';
import {
  type AcademyFilters,
  type AcademyPageData,
  type AcademyRecord,
  type AcademyResource,
  normalizeRecord,
  record,
  records,
  textValue,
} from './models';

export const academyKey = (userId: string) => ['academy', userId] as const;

export async function findAcademyMatches(
  values: Record<string, string>,
  signal?: AbortSignal,
): Promise<ResponseCandidate[]> {
  const response = (
    await students.studentsControllerMatchV1(
      Object.fromEntries(
        ['name', 'email', 'phone', 'legacyCode']
          .filter((key) => values[key]?.trim())
          .map((key) => [key, values[key]?.trim() ?? '']),
      ),
      { signal: signal ?? null },
    )
  ).data;
  return response.flatMap((candidate): ResponseCandidate[] => {
    const value = record(candidate);
    const personId = textValue(value.personId);
    const publicId = textValue(value.publicId);
    if (!personId || !publicId) return [];
    return [
      {
        personId,
        publicId,
        name: typeof value.name === 'string' ? value.name : null,
        reasons: Array.isArray(value.reasons)
          ? value.reasons.filter((reason): reason is string => typeof reason === 'string')
          : [],
      },
    ];
  });
}

export async function getAcademyContext(signal?: AbortSignal) {
  return (await authControllerMeV1({ signal: signal ?? null })).data;
}

export async function getAcademyPage(
  resource: AcademyResource,
  filters: AcademyFilters = {},
  signal?: AbortSignal,
): Promise<AcademyPageData> {
  const request = { signal: signal ?? null };
  const common = {
    limit: 25,
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
    ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
  };
  const status = filters.status ? { status: filters.status } : {};
  const leadState = Object.values(LeadsControllerListV1State).find(
    (value) => value === filters.status,
  );
  const enrollmentState = Object.values(EnrollmentControllerListV1State).find(
    (value) => value === filters.status,
  );
  let result: unknown;
  switch (resource) {
    case 'leads':
      result = (
        await crm.leadsControllerListV1(
          { ...common, ...(leadState ? { state: leadState } : {}) },
          request,
        )
      ).data;
      break;
    case 'students':
      result = (await students.studentsControllerListV1(common, request)).data;
      break;
    case 'registrations': {
      const state = filters.status;
      result = (
        await students.studentRegistrationControllerListV1(
          {
            limit: 25,
            page: filters.page ?? 1,
            ...(state === 'PENDING' || state === 'APPROVED' || state === 'REJECTED'
              ? { status: state }
              : {}),
          },
          request,
        )
      ).data;
      break;
    }
    case 'enrollments':
      result = (
        await enrollment.enrollmentControllerListV1(
          {
            limit: 25,
            ...(filters.cursor ? { cursor: filters.cursor } : {}),
            ...(enrollmentState ? { state: enrollmentState } : {}),
            ...(filters.studentId ? { studentPersonId: filters.studentId } : {}),
            ...(filters.cohortId ? { cohortId: filters.cohortId } : {}),
          },
          request,
        )
      ).data;
      break;
    case 'programs':
      result = (await catalog.programsControllerListV1({ ...common, ...status }, request)).data;
      break;
    case 'cohorts':
      result = (await cohorts.cohortsControllerListV1({ ...common, ...status }, request)).data;
      break;
    case 'rooms':
      result = (await resources.roomsControllerListV1(common, request)).data;
      break;
    case 'trainers':
      result = (await resources.trainersControllerListV1({ ...common, ...status }, request)).data;
      break;
    case 'modules':
      result = (await catalog.modulesControllerListV1(common, request)).data;
      break;
    case 'stages':
      result = {
        items: (await crm.leadStagesControllerListV1({ includeInactive: true }, request)).data,
        nextCursor: null,
      };
      break;
    default:
      throw new Error('Unsupported academy list');
  }
  const page = record(result);
  if (!Array.isArray(page.items)) throw new Error('Invalid academy page');
  return {
    items: page.items.map((item) => normalizeRecord(resource, item)),
    nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null,
    ...(typeof page.total === 'number' ? { total: page.total } : {}),
    ...(typeof page.pages === 'number' ? { pages: page.pages } : {}),
  };
}

export async function getAcademyDetail(
  resource: AcademyResource,
  row: AcademyRecord,
  signal?: AbortSignal,
): Promise<AcademyRecord> {
  const request = { signal: signal ?? null };
  let result: unknown;
  switch (resource) {
    case 'leads':
      result = (await crm.leadsControllerReadV1(row.id, request)).data;
      break;
    case 'students':
      result = (await students.studentsControllerReadV1(row.id, request)).data;
      break;
    case 'registrations':
      result = (await students.studentRegistrationControllerGetOneV1(row.id, request)).data;
      break;
    case 'enrollments':
      result = (await enrollment.enrollmentControllerReadV1(row.id, request)).data;
      break;
    case 'programs':
      result = (await catalog.programsControllerReadV1(row.id, request)).data;
      break;
    case 'versions':
      result = (await catalog.programVersionsControllerReadV1(row.id, request)).data;
      break;
    case 'cohorts': {
      const cohort = (await cohorts.cohortsControllerReadV1(row.id, request)).data;
      if (!cohort.programVersionId) {
        result = cohort;
        break;
      }
      const version = (
        await catalog.programVersionsControllerReadV1(cohort.programVersionId, request)
      ).data;
      const program = (await catalog.programsControllerReadV1(version.programId, request)).data;
      result = {
        ...cohort,
        program: { id: program.id, name: program.name, code: program.code },
        programVersion: { id: version.id, version: version.version, status: version.status },
      };
      break;
    }
    case 'trainers':
      result = (await resources.trainersControllerReadV1(row.id, request)).data;
      break;
    default:
      return row;
  }
  return normalizeRecord(resource, result);
}

export async function getAssignees(branchId: string, search: string, signal?: AbortSignal) {
  const result = await crm.leadsControllerAssigneesV1(
    { branchId, limit: 50, ...(search.trim().length >= 2 ? { search: search.trim() } : {}) },
    { signal: signal ?? null },
  );
  const data = result.data;
  return records(Array.isArray(data) ? data : record(data).items).map((item) => ({
    id: textValue(item.userId),
    name: textValue(item.name),
    data: item,
  }));
}
