export const REALTIME_CHANNEL = 'plg:realtime:invalidations:v1';

export const realtimeTopics = [
  'owner',
  'accounts',
  'attendance',
  'student',
  'calendar',
  'notifications',
  'messaging',
] as const;

export type RealtimeTopic = (typeof realtimeTopics)[number];

export type InternalEventEnvelope = {
  v: 1;
  eventId: string;
  type: string;
  organizationId: string;
  aggregate: { type: string; id: string };
  occurredAt: string;
  payload: unknown;
};

export type OutboxEnvelopeSource = {
  id: string;
  type: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  payload: unknown;
};

export type ClientInvalidation = {
  v: 1;
  eventId: string;
  topics: RealtimeTopic[];
  occurredAt: string;
};

export type RealtimeFanoutMessage = {
  v: 1;
  organizationId: string;
  staff: boolean;
  studentPersonIds: string[];
  invalidation: ClientInvalidation;
};

export type RealtimeResync = {
  v: 1;
  topics: RealtimeTopic[];
  occurredAt: string;
};

export function internalEnvelopeFrom(event: OutboxEnvelopeSource): InternalEventEnvelope {
  return {
    v: 1,
    eventId: event.id,
    type: event.type,
    organizationId: event.organizationId,
    aggregate: { type: event.aggregateType, id: event.aggregateId },
    occurredAt: event.occurredAt.toISOString(),
    payload: event.payload,
  };
}

export function parseInternalEnvelope(value: unknown): InternalEventEnvelope | null {
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.aggregate)) return null;
  if (
    !isString(value.eventId) ||
    !isString(value.type) ||
    !isString(value.organizationId) ||
    !isString(value.aggregate.type) ||
    !isString(value.aggregate.id) ||
    !isIsoDate(value.occurredAt) ||
    !Object.hasOwn(value, 'payload')
  ) {
    return null;
  }
  return value as InternalEventEnvelope;
}

export function parseFanoutMessage(value: unknown): RealtimeFanoutMessage | null {
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.invalidation)) return null;
  const invalidation = value.invalidation;
  const topics = invalidation.topics;
  if (
    !isString(value.organizationId) ||
    typeof value.staff !== 'boolean' ||
    !isStringArray(value.studentPersonIds) ||
    invalidation.v !== 1 ||
    !isString(invalidation.eventId) ||
    !Array.isArray(topics) ||
    !topics.every((topic) => realtimeTopics.includes(topic as RealtimeTopic)) ||
    !isIsoDate(invalidation.occurredAt)
  ) {
    return null;
  }
  return {
    v: 1,
    organizationId: value.organizationId,
    staff: value.staff,
    studentPersonIds: [...new Set(value.studentPersonIds)],
    invalidation: {
      v: 1,
      eventId: invalidation.eventId,
      topics: [...new Set(topics as RealtimeTopic[])],
      occurredAt: invalidation.occurredAt,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isIsoDate(value: unknown): value is string {
  return isString(value) && Number.isFinite(Date.parse(value));
}
