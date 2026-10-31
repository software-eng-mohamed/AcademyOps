import { personFor } from './academy-relations';
import {
  addStudent,
  contactValues,
  pick,
  saved,
  validContacts,
  validDate,
  validFields,
} from './academy-write';
import {
  branchId,
  bump,
  type DemoContext,
  failure,
  find,
  invalid,
  json,
  object,
  records,
  required,
  string,
  timestamp,
  versionConflict,
} from './shared';

function validStudent(body: Record<string, unknown>, creating: boolean) {
  if (!required(body.name) || !validDate(body.birthDate)) return false;
  if (body.gender !== undefined && !['MALE', 'FEMALE'].includes(string(body.gender))) return false;
  if (body.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(string(body.email)))
    return false;
  if (body.phone !== undefined && !/^\+?[\d\s()-]{5,20}$/.test(string(body.phone))) return false;
  return !creating || body.branchId === branchId;
}
export function handleStudentRoute(context: DemoContext): Response | null {
  const { state, body, path, method } = context;
  const [noun, id, command] = path;
  if (noun === 'students' && id === 'match-candidates' && method === 'POST') {
    const matches = records(state, 'students').filter((person) =>
      ['name', 'email', 'phone', 'legacyCode'].some(
        (field) =>
          required(body[field]) &&
          string(person[field]).toLowerCase() === string(body[field]).trim().toLowerCase(),
      ),
    );
    return json(
      matches.map((person) => ({
        personId: person.id,
        publicId: person.publicId,
        name: person.name,
        reasons: ['MATCHING_DETAILS'],
      })),
    );
  }
  if (noun === 'students' && !id && method === 'POST') {
    if (!validStudent(body, true)) return invalid();
    if (
      body.email &&
      records(state, 'students').some(
        (item) => string(item.email).toLowerCase() === string(body.email).toLowerCase(),
      )
    )
      return failure('STUDENT_ALREADY_EXISTS', 409);
    return saved(context, 'students', addStudent(state, body), 'CREATE', 201);
  }
  if (noun === 'students' && id && method !== 'GET') {
    const item = find(state, 'students', id);
    if (!item) return null;
    const conflict = versionConflict(context, item);
    if (conflict) return conflict;
    if (path.length === 2 && method === 'PATCH') {
      if (!validStudent(body, false) || !validFields(body, ['name', 'birthDate', 'gender']))
        return invalid();
      return saved(
        context,
        'students',
        bump(item, pick(body, ['name', 'birthDate', 'gender'])),
        'UPDATE',
      );
    }
    if (path.length === 3 && command === 'contacts' && method === 'PUT') {
      if (!validContacts(body.contacts)) return invalid();
      const contacts = contactValues(state, id, body.contacts);
      return saved(
        context,
        'students',
        bump(item, {
          contacts,
          email:
            contacts.find((contact) => contact.type === 'EMAIL' && contact.isPrimary)?.rawValue ??
            null,
          phone:
            contacts.find((contact) => contact.type === 'PHONE' && contact.isPrimary)?.rawValue ??
            null,
        }),
        'CONTACTS_REPLACED',
      );
    }
    if (path.length === 3 && command === 'merge' && method === 'POST') {
      const target = find(state, 'students', body.targetPersonId);
      if (!target || target.id === id || !required(body.reason, 1000)) return invalid();
      if (target.version !== body.targetVersion) return failure('VERSION_CONFLICT', 409);
      for (const enrollment of records(state, 'enrollments').filter(
        (entry) => entry.studentPersonId === id,
      ))
        bump(enrollment, { studentPersonId: target.id });
      for (const lead of records(state, 'leads').filter((entry) => entry.personId === id))
        bump(lead, { personId: target.id });
      for (const account of records(state, 'billingAccounts').filter(
        (entry) => entry.ownerPersonId === id || entry.studentPersonId === id,
      ))
        bump(account, { ownerPersonId: target.id, studentPersonId: target.id });
      state.collections.students = records(state, 'students').filter((entry) => entry.id !== id);
      bump(target, {});
      return saved(context, 'students', target, 'MERGE');
    }
  }
  if (
    noun === 'student-registrations' &&
    id &&
    path.length === 3 &&
    method === 'POST' &&
    ['approve', 'reject'].includes(command ?? '')
  ) {
    const registration = find(state, 'studentRegistrations', id);
    if (!registration) return null;
    const conflict = versionConflict(context, registration);
    if (conflict) return conflict;
    if (registration.status !== 'PENDING') return failure('INVALID_STATE_TRANSITION', 409);
    if (command === 'approve') {
      if (
        body.verificationMethod !== 'IN_PERSON_EMAIL_OWNERSHIP' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{9,79}$/.test(string(body.verificationReference))
      )
        return invalid();
      const person = personFor(state, registration.personId);
      if (!person) return invalid();
      if (!find(state, 'students', person.id))
        addStudent(
          state,
          { ...person, ...object(registration), name: person.name, branchId },
          person.id,
        );
    } else if (!required(body.reason, 1000)) return invalid();
    bump(registration, {
      status: command === 'approve' ? 'APPROVED' : 'REJECTED',
      reviewedAt: timestamp(),
      rejectionReason: command === 'reject' ? body.reason : null,
    });
    return saved(context, 'studentRegistrations', registration, string(command).toUpperCase());
  }
  return null;
}
