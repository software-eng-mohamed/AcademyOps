import { academyView, personFor } from './academy-relations';
import {
  addEvent,
  contactValues,
  insert,
  pick,
  saved,
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
  object,
  ownerId,
  required,
  string,
  versionConflict,
} from './shared';

export function handleLeadRoute(context: DemoContext): Response | null {
  const { state, path, body, method } = context;
  if (path[0] !== 'leads' || method === 'GET') return null;
  const id = path[1];
  const action = path[2];
  if (!id && method === 'POST') {
    if (
      body.branchId !== branchId ||
      !validDate(body.nextActionAt) ||
      (body.stageId && !find(state, 'leadStages', body.stageId))
    )
      return invalid();
    let person = personFor(state, body.personId);
    if (!person) {
      const newPerson = object(body.newPerson);
      if (
        !required(newPerson.name) ||
        (newPerson.email !== undefined &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(string(newPerson.email)))
      )
        return invalid();
      person = insert(state, 'people', {
        name: newPerson.name,
        email: newPerson.email ?? null,
        phone: newPerson.phone ?? null,
        publicId: `AO-P${state.sequence + 1}`,
      });
      person.contacts = contactValues(
        state,
        person.id,
        ['email', 'phone']
          .filter((field) => required(newPerson[field]))
          .map((field) => ({
            type: field.toUpperCase(),
            value: newPerson[field],
            isPrimary: true,
          })),
      );
    }
    const lead = insert(state, 'leads', {
      personId: person.id,
      branchId,
      state: 'NEW',
      assignedUserId: ownerId,
      stageId: body.stageId ?? null,
      source: body.source ?? null,
      nextActionAt: body.nextActionAt ?? null,
      lostReason: null,
    });
    return saved(context, 'leads', lead, 'CREATE', 201);
  }
  const lead = find(state, 'leads', id);
  if (!lead) return null;
  const conflict = versionConflict(context, lead);
  if (conflict) return conflict;
  if (path.length === 2 && method === 'PATCH') {
    if (
      !validFields(body, ['stageId', 'source', 'nextActionAt']) ||
      !Object.keys(body).length ||
      !validDate(body.nextActionAt) ||
      (body.stageId && !find(state, 'leadStages', body.stageId))
    )
      return invalid();
    return saved(
      context,
      'leads',
      bump(lead, pick(body, ['stageId', 'source', 'nextActionAt'])),
      'UPDATE',
    );
  }
  if (path.length !== 3 || method !== 'POST') return null;
  if (action === 'claim' || action === 'assign') {
    if (action === 'assign' && body.userId !== ownerId) return invalid();
    return saved(context, 'leads', bump(lead, { assignedUserId: ownerId }), action.toUpperCase());
  }
  if (action === 'activities') {
    if (
      !['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE'].includes(string(body.type)) ||
      !required(object(body.data).note, 5000) ||
      !validDate(body.occurredAt)
    )
      return invalid();
    const activity = insert(state, 'leadActivities', {
      leadId: lead.id,
      actorUserId: ownerId,
      type: body.type,
      data: { note: object(body.data).note },
      occurredAt: body.occurredAt ?? lead.updatedAt,
    });
    return saved(context, 'leadActivities', activity, 'ACTIVITY_RECORDED', 201);
  }
  const transitions: Record<string, { from: string[]; to: string }> = {
    open: { from: ['NEW'], to: 'OPEN' },
    qualify: { from: ['OPEN'], to: 'QUALIFIED' },
    lose: { from: ['NEW', 'OPEN', 'QUALIFIED'], to: 'LOST' },
    disqualify: { from: ['NEW', 'OPEN', 'QUALIFIED'], to: 'DISQUALIFIED' },
    reopen: { from: ['LOST', 'DISQUALIFIED'], to: 'OPEN' },
  };
  const transition = transitions[action ?? ''];
  if (!transition) return null;
  if (!transition.from.includes(string(lead.state)))
    return failure('INVALID_STATE_TRANSITION', 409);
  if (['lose', 'disqualify', 'reopen'].includes(action ?? '') && !required(body.reason, 1000))
    return invalid();
  addEvent(state, 'leadHistory', 'leadId', lead, lead.state, transition.to, body.reason);
  bump(lead, {
    state: transition.to,
    lostReason: ['LOST', 'DISQUALIFIED'].includes(transition.to) ? body.reason : null,
  });
  return saved(context, 'leads', academyView(state, 'leads', lead), string(action).toUpperCase());
}
