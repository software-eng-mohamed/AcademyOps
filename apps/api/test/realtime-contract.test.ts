import type { AccessContext } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { RealtimeSessionPrincipal } from '../src/iam/authorization/session-access.service';
import {
  internalEnvelopeFrom,
  parseFanoutMessage,
  type RealtimeFanoutMessage,
} from '../src/realtime/realtime.contracts';
import { RealtimeMessageProcessor } from '../src/realtime/realtime-message-processor';
import { realtimePolicyFor } from '../src/realtime/realtime-policy';
import { roomsForFanout, roomsForPrincipal } from '../src/realtime/realtime-rooms';

describe('realtime contracts', () => {
  it('queues a complete internal envelope while client invalidations stay payload-free', () => {
    const envelope = internalEnvelopeFrom({
      id: 'event-id',
      type: 'payment.posted',
      organizationId: 'org-a',
      aggregateType: 'Payment',
      aggregateId: 'payment-id',
      occurredAt: new Date('2026-08-11T12:00:00.000Z'),
      payload: { card: 'sensitive', amount: 100 },
    });
    expect(envelope).toMatchObject({
      eventId: 'event-id',
      organizationId: 'org-a',
      aggregate: { type: 'Payment', id: 'payment-id' },
      payload: { card: 'sensitive' },
    });

    const parsed = parseFanoutMessage({
      v: 1,
      organizationId: 'org-a',
      staff: true,
      studentPersonIds: ['student-a'],
      payload: envelope.payload,
      invalidation: {
        v: 1,
        eventId: envelope.eventId,
        topics: ['accounts', 'student'],
        occurredAt: envelope.occurredAt,
        aggregateId: envelope.aggregate.id,
      },
    });
    expect(parsed?.invalidation).toEqual({
      v: 1,
      eventId: 'event-id',
      topics: ['accounts', 'student'],
      occurredAt: '2026-08-11T12:00:00.000Z',
    });
    expect(JSON.stringify(parsed?.invalidation)).not.toContain('sensitive');
    expect(JSON.stringify(parsed?.invalidation)).not.toContain('payment-id');
  });

  it('drops unknown and security-sensitive event types', () => {
    expect(realtimePolicyFor('security.password_reset_requested')).toBeNull();
    expect(realtimePolicyFor('security.phone_otp_requested')).toBeNull();
    expect(realtimePolicyFor('paymob.checkout.requested')).toBeNull();
    expect(realtimePolicyFor('unknown.event')).toBeNull();
    expect(realtimePolicyFor('payment.posted')?.topics).toContain('accounts');
  });

  it('routes every sanitized import lifecycle event only to the owner topic', () => {
    const types = [
      'imports.batch.staged',
      'imports.batch.validated',
      'imports.batch.issue_resolved',
      'imports.batch.ready_rows_promoted',
      'imports.batch.reconciled',
      'imports.batch.finalized',
    ];
    for (const type of types) expect(realtimePolicyFor(type)?.topics, type).toEqual(['owner']);
  });

  it('routes sanitized IAM invalidations only to the source tenant owner room', () => {
    const types = [
      'user.created',
      'user.status_changed',
      'user.roles_replaced',
      'user.branches_replaced',
      'role.created',
      'role.updated',
      'role.grants_replaced',
      'branch.created',
      'branch.updated',
    ];
    for (const type of types) expect(realtimePolicyFor(type)?.topics, type).toEqual(['owner']);

    const parsed = parseFanoutMessage({
      v: 1,
      organizationId: 'org-a',
      staff: true,
      studentPersonIds: [],
      payload: { email: 'private@example.com', temporaryPassword: 'never-publish' },
      invalidation: {
        v: 1,
        eventId: 'iam-event-a',
        topics: ['owner'],
        occurredAt: '2026-08-11T12:00:00.000Z',
        aggregateId: 'private-target-id',
        reason: 'private-reason',
      },
    });
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('Expected a valid IAM fanout message');
    expect(roomsForFanout(parsed)).toEqual(['org:org-a:staff']);
    expect(roomsForFanout(parsed)).not.toContain('org:org-b:staff');
    expect(JSON.stringify(parsed)).not.toContain('private@example.com');
    expect(JSON.stringify(parsed)).not.toContain('never-publish');
    expect(JSON.stringify(parsed)).not.toContain('private-target-id');
    expect(JSON.stringify(parsed)).not.toContain('private-reason');
  });

  it('allowlists every command emitted by EnrollmentEventService', () => {
    const emittedCommands = [
      'create',
      'submit',
      'activate',
      'reject',
      'postpone',
      'resume',
      'complete',
      'cancel',
      'transfer',
    ];
    for (const command of emittedCommands) {
      expect(realtimePolicyFor(`enrollment.${command}`), command).not.toBeNull();
    }
    expect(realtimePolicyFor('enrollment.security_override')).toBeNull();
    expect(realtimePolicyFor('enrollment.unknown')).toBeNull();
  });

  it('rejects invalid topics and derives tenant rooms without client input', () => {
    expect(
      parseFanoutMessage({
        v: 1,
        organizationId: 'org-a',
        staff: true,
        studentPersonIds: [],
        invalidation: {
          v: 1,
          eventId: 'event-id',
          topics: ['admin-secrets'],
          occurredAt: new Date().toISOString(),
        },
      }),
    ).toBeNull();
    const principal = principalFixture('org-a', 'student-a');
    expect(roomsForPrincipal(principal)).toEqual([
      'org:org-a:staff',
      'org:org-a:student:student-a',
    ]);
    const malicious = { ...principal, requestedRoom: 'org:org-b:staff' };
    expect(roomsForPrincipal(malicious)).not.toContain('org:org-b:staff');
  });

  it('fans out once per API instance and deduplicates repeats locally', () => {
    const first = new RealtimeMessageProcessor();
    const second = new RealtimeMessageProcessor();
    const firstSink = vi.fn();
    const secondSink = vi.fn();
    const raw = JSON.stringify(messageFixture());

    expect(first.process(raw, firstSink)).toBe(true);
    expect(second.process(raw, secondSink)).toBe(true);
    expect(first.process(raw, firstSink)).toBe(false);
    expect(firstSink).toHaveBeenCalledTimes(1);
    expect(secondSink).toHaveBeenCalledTimes(1);
  });

  it('uses a Socket.IO room union so overlapping recipients receive one local emit', () => {
    const rooms = roomsForFanout(messageFixture());
    expect(rooms).toEqual(['org:org-a:staff', 'org:org-a:student:student-a']);
  });
});

function principalFixture(
  organizationId: string,
  studentPersonId: string,
): RealtimeSessionPrincipal {
  const accessContext: AccessContext = {
    organizationId,
    actorUserId: 'user-a',
    grants: new Map(),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
    studentPersonId,
  };
  return { sessionId: 'session-a', accessContext, isStaff: true, isStudent: true };
}

function messageFixture(): RealtimeFanoutMessage {
  return {
    v: 1,
    organizationId: 'org-a',
    staff: true,
    studentPersonIds: ['student-a'],
    invalidation: {
      v: 1,
      eventId: 'event-a',
      topics: ['student'],
      occurredAt: '2026-08-11T12:00:00.000Z',
    },
  };
}
