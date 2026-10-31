import { academyView } from './academy-relations';
import {
  codeExists,
  insert,
  pick,
  saved,
  validCapacity,
  validDate,
  validFields,
} from './academy-write';
import {
  branchId,
  bump,
  type DemoContext,
  type DemoRecord,
  failure,
  find,
  invalid,
  object,
  records,
  required,
  string,
  versionConflict,
} from './shared';

const catalogs: Record<string, string> = {
  programs: 'programs',
  'program-versions': 'programVersions',
  modules: 'modules',
  cohorts: 'cohorts',
  rooms: 'rooms',
  trainers: 'trainers',
  'lead-stages': 'leadStages',
};
function validCurriculum(context: DemoContext) {
  const modules = context.body.modules;
  return (
    Array.isArray(modules) &&
    modules.length > 0 &&
    modules.length <= 40 &&
    new Set(modules.map((item) => object(item).moduleId)).size === modules.length &&
    modules.every((value) => {
      const item = object(value);
      return (
        find(context.state, 'modules', item.moduleId) &&
        typeof item.required === 'boolean' &&
        validCapacity(item.ordinal)
      );
    })
  );
}
function replaceCurriculum(context: DemoContext, version: DemoRecord) {
  context.state.collections.programVersionModules = records(
    context.state,
    'programVersionModules',
  ).filter((item) => item.programVersionId !== version.id);
  const modules = context.body.modules as Record<string, unknown>[];
  modules.forEach((item, index) => {
    insert(context.state, 'programVersionModules', {
      programVersionId: version.id,
      moduleId: item.moduleId,
      required: item.required,
      ordinal: index + 1,
    });
  });
}
function validPatch(collection: string, body: Record<string, unknown>) {
  const fields: Record<string, string[]> = {
    programs: ['name', 'status'],
    modules: ['name', 'isActive'],
    rooms: ['name', 'capacity', 'isActive'],
    trainers: ['biographyEn', 'biographyAr', 'status'],
    leadStages: ['name', 'ordinal', 'isActive'],
    cohorts: ['name', 'startsOn', 'endsOn', 'capacity'],
  };
  if (!Object.keys(body).length || !validFields(body, fields[collection] ?? [])) return false;
  if (body.name !== undefined && !required(body.name)) return false;
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') return false;
  if (
    !validCapacity(body.capacity) ||
    !validCapacity(body.ordinal) ||
    !validDate(body.startsOn) ||
    !validDate(body.endsOn)
  )
    return false;
  if (
    body.status !== undefined &&
    !(collection === 'trainers' ? ['ACTIVE', 'INACTIVE'] : ['ACTIVE', 'ARCHIVED']).includes(
      string(body.status),
    )
  )
    return false;
  return ['biographyEn', 'biographyAr'].every(
    (key) => body[key] === undefined || required(body[key], 5000),
  );
}
export function handleCatalogRoute(context: DemoContext): Response | null {
  const { state, path, body, method } = context;
  const noun = path[0] ?? '';
  const collection = catalogs[noun];
  if (!collection || method === 'GET') return null;
  const id = path[1];
  const command = path[2];
  if (!id && method === 'POST' && collection !== 'programVersions') {
    const coded = ['programs', 'modules', 'rooms', 'cohorts', 'leadStages'].includes(collection);
    if (
      (collection !== 'cohorts' && !required(body.name)) ||
      (coded && !/^[A-Za-z0-9][A-Za-z0-9_/-]{1,79}$/.test(string(body.code)))
    )
      return invalid();
    if (coded && codeExists(state, collection, body.code)) return failure('DUPLICATE_CODE', 409);
    if (!validCapacity(body.capacity) || !validDate(body.startsOn) || !validDate(body.endsOn))
      return invalid();
    if (collection === 'leadStages' && (body.ordinal === undefined || !validCapacity(body.ordinal)))
      return invalid();
    if (
      ['cohorts', 'rooms'].includes(collection) &&
      (body.owningBranchId ?? body.branchId) !== branchId
    )
      return invalid();
    const version = find(state, 'programVersions', body.programVersionId);
    if (collection === 'cohorts' && version?.status !== 'PUBLISHED') return invalid();
    const values = pick(body, [
      'name',
      'code',
      'capacity',
      'ordinal',
      'biographyEn',
      'biographyAr',
      'startsOn',
      'endsOn',
    ]);
    const item = insert(state, collection, {
      ...values,
      ...(collection === 'cohorts'
        ? {
            programVersionId: version?.id,
            owningBranchId: branchId,
            status: 'DRAFT',
            capacity: body.capacity ?? 12,
            startsOn: body.startsOn ?? null,
            endsOn: body.endsOn ?? null,
            scheduleState: 'NO_SOURCE_SCHEDULE',
            scheduledSessionCount: 0,
            sourceSessionCount: 0,
            scheduleConflictCount: 0,
            sourceAliases: [],
          }
        : { status: 'ACTIVE', isActive: true }),
      ...(collection === 'rooms' ? { branchId } : {}),
    });
    if (collection === 'trainers')
      item.person = { id: item.id, name: item.name, publicId: `TRAINER-${state.sequence}` };
    if (collection === 'cohorts')
      for (const module of records(state, 'programVersionModules').filter(
        (entry) => entry.programVersionId === version?.id,
      ))
        insert(state, 'cohortModules', {
          cohortId: item.id,
          programVersionModuleId: module.id,
          moduleId: module.moduleId,
          required: module.required,
          ordinal: module.ordinal,
        });
    return saved(context, collection, item, 'CREATE', 201);
  }
  const item = find(state, collection, id);
  if (!item) return null;
  const conflict = versionConflict(
    context,
    collection === 'programVersions' ? { ...item, version: item.recordVersion } : item,
  );
  if (conflict) return conflict;
  if (path.length === 2 && method === 'PATCH' && collection !== 'programVersions') {
    if (!validPatch(collection, body)) return invalid();
    if (collection === 'cohorts' && !['DRAFT', 'PLANNED'].includes(string(item.status)))
      return failure('INVALID_STATE_TRANSITION', 409);
    if (body.startsOn && body.endsOn && String(body.endsOn) < String(body.startsOn))
      return invalid();
    return saved(context, collection, bump(item, body), 'UPDATE');
  }
  if (
    collection === 'programs' &&
    command === 'versions' &&
    method === 'POST' &&
    path.length === 3
  ) {
    if (item.status !== 'ACTIVE' || !validCurriculum(context)) return invalid();
    const nextVersion =
      Math.max(
        0,
        ...records(state, 'programVersions')
          .filter((entry) => entry.programId === item.id)
          .map((entry) => Number(entry.version)),
      ) + 1;
    const created = insert(state, 'programVersions', {
      programId: item.id,
      version: nextVersion,
      recordVersion: 1,
      status: 'DRAFT',
      effectiveFrom: null,
      effectiveTo: null,
    });
    replaceCurriculum(context, created);
    return saved(context, 'programVersions', created, 'CREATE', 201);
  }
  if (collection === 'programVersions' && path.length === 3) {
    const revision = item.version;
    const lock = Number(item.recordVersion);
    if (command === 'curriculum' && method === 'PUT') {
      if (item.status !== 'DRAFT' || !validCurriculum(context)) return invalid();
      replaceCurriculum(context, item);
      bump(item, { recordVersion: lock + 1 });
      item.version = revision;
      return saved(context, collection, item, 'CURRICULUM_REPLACED');
    }
    if (command === 'publish' && method === 'POST') {
      if (
        item.status !== 'DRAFT' ||
        !required(body.effectiveFrom) ||
        !validDate(body.effectiveFrom) ||
        !records(state, 'programVersionModules').some((entry) => entry.programVersionId === item.id)
      )
        return invalid();
      bump(item, {
        status: 'PUBLISHED',
        effectiveFrom: body.effectiveFrom,
        recordVersion: lock + 1,
      });
      item.version = revision;
      return saved(context, collection, item, 'PUBLISH');
    }
    if (command === 'archive' && method === 'POST') {
      if (item.status !== 'PUBLISHED' || !required(body.reason, 1000)) return invalid();
      bump(item, { status: 'ARCHIVED', recordVersion: lock + 1 });
      item.version = revision;
      return saved(context, collection, item, 'ARCHIVE');
    }
  }
  if (collection === 'cohorts' && method === 'POST' && path.length === 3) {
    const transitions: Record<string, { from: string[]; to: string }> = {
      plan: { from: ['DRAFT'], to: 'PLANNED' },
      activate: { from: ['PLANNED'], to: 'ACTIVE' },
      complete: { from: ['ACTIVE'], to: 'COMPLETED' },
      cancel: { from: ['DRAFT', 'PLANNED', 'ACTIVE'], to: 'CANCELLED' },
    };
    const transition = transitions[command ?? ''];
    if (!transition) return null;
    if (
      !transition.from.includes(string(item.status)) ||
      (command === 'activate' &&
        academyView(state, collection, item).intakeStatus !== 'READY_TO_START')
    )
      return failure('INVALID_STATE_TRANSITION', 409);
    return saved(
      context,
      collection,
      bump(item, { status: transition.to }),
      string(command).toUpperCase(),
    );
  }
  return null;
}
