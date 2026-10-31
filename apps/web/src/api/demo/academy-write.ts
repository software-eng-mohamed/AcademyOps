import { academyView } from './academy-relations';
import {
  audit,
  baseRecord,
  type DemoContext,
  type DemoRecord,
  type DemoState,
  json,
  nextId,
  object,
  records,
  required,
  string,
  timestamp,
} from './shared';

export function insert(state: DemoState, collection: string, values: Record<string, unknown>) {
  const item = baseRecord(nextId(state), values);
  state.collections[collection] ??= [];
  state.collections[collection].unshift(item);
  return item;
}
export function saved(
  context: DemoContext,
  collection: string,
  item: DemoRecord,
  action: string,
  status = 200,
) {
  audit(context.state, action, item, collection);
  return json(academyView(context.state, collection, item), status);
}
export function pick(body: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(
    fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]),
  );
}
export function validFields(body: Record<string, unknown>, fields: readonly string[]) {
  return Object.keys(body).every((field) => fields.includes(field));
}
export function validDate(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && Number.isFinite(Date.parse(value)))
  );
}
export function validCapacity(value: unknown) {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1000)
  );
}
export function contactValues(state: DemoState, personId: string, contacts: unknown[]) {
  return contacts.map((value) => {
    const item = object(value);
    const rawValue = string(item.value ?? item.rawValue).trim();
    return baseRecord(nextId(state), {
      personId,
      type: item.type,
      rawValue,
      normalizedValue: item.type === 'EMAIL' ? rawValue.toLowerCase() : rawValue,
      isPrimary: item.isPrimary === true,
      verifiedAt: null,
    });
  });
}
export function validContacts(values: unknown): values is unknown[] {
  if (!Array.isArray(values) || values.length > 10) return false;
  return (
    values.every((value) => {
      const item = object(value);
      return (
        ['EMAIL', 'PHONE'].includes(string(item.type)) &&
        typeof item.isPrimary === 'boolean' &&
        required(item.value, 200) &&
        (item.type === 'EMAIL'
          ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(string(item.value))
          : /^\+?[\d\s()-]{5,20}$/.test(string(item.value)))
      );
    }) &&
    ['EMAIL', 'PHONE'].every(
      (type) =>
        values.filter((value) => object(value).type === type && object(value).isPrimary === true)
          .length <= 1,
    )
  );
}
export function addStudent(state: DemoState, values: Record<string, unknown>, existingId?: string) {
  const item = baseRecord(existingId ?? nextId(state), {
    ...pick(values, ['name', 'birthDate', 'gender', 'branchId', 'legacyCode']),
    publicId: `AO-${state.sequence}`,
    birthDate: values.birthDate ?? null,
    gender: values.gender ?? null,
  });
  item.contacts = contactValues(
    state,
    item.id,
    ['email', 'phone']
      .filter((field) => required(values[field]))
      .map((field) => ({ type: field.toUpperCase(), value: values[field], isPrimary: true })),
  );
  item.email = values.email ?? null;
  item.phone = values.phone ?? null;
  item.studentProfile = baseRecord(nextId(state), { personId: item.id, portalStatus: 'ACTIVE' });
  state.collections.students ??= [];
  state.collections.students.unshift(item);
  return item;
}
export function addEvent(
  state: DemoState,
  collection: string,
  idField: string,
  item: DemoRecord,
  fromState: unknown,
  toState: string,
  reason: unknown,
) {
  return insert(state, collection, {
    [idField]: item.id,
    fromState: fromState ?? null,
    toState,
    reason: string(reason) || null,
    occurredAt: timestamp(),
    actorUserId: '00000000-0000-4000-8000-000000000003',
  });
}
export function codeExists(state: DemoState, collection: string, code: unknown) {
  return records(state, collection).some(
    (item) => string(item.code).toLowerCase() === string(code).toLowerCase(),
  );
}
