import { hasBookingConflict, trainersFor } from './session-bookings';
import { roster } from './session-fixtures';
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
  ownerId,
  page,
  records,
  required,
  string,
  timestamp,
  unsupported,
  versionConflict,
} from './shared';

export function handleSessionRoute(ctx: DemoContext): Response | null {
  const { state, path, body, method, url } = ctx;
  if (path[0] === 'calendar' && method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    return json({
      items: records(state, 'sessions').filter(
        (item) => (!from || string(item.startsAt) >= from) && (!to || string(item.startsAt) <= to),
      ),
      nextCursor: null,
    });
  }
  if (path[0] === 'sessions') {
    if (method === 'GET' && path.length === 1) {
      const sessions = records(state, 'sessions').filter((item) => {
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const room = url.searchParams.get('roomId');
        const trainer = url.searchParams.get('trainerId');
        return (
          (!from || string(item.startsAt) >= from) &&
          (!to || string(item.startsAt) <= to) &&
          (!room || item.roomId === room) &&
          (!trainer ||
            (Array.isArray(item.trainers) &&
              item.trainers.some((entry) => object(entry).trainerId === trainer)))
        );
      });
      return page(sessions, url);
    }
    if (method === 'POST' && path.length === 1) {
      const cohort = find(state, 'cohorts', body.cohortId);
      const cohortModule = find(state, 'cohortModules', body.cohortModuleId);
      if (
        !cohort ||
        !cohortModule ||
        cohortModule.cohortId !== cohort.id ||
        !required(body.startsAt) ||
        !required(body.endsAt) ||
        !Number.isFinite(Date.parse(string(body.startsAt))) ||
        !Number.isFinite(Date.parse(string(body.endsAt))) ||
        Date.parse(string(body.endsAt)) <= Date.parse(string(body.startsAt)) ||
        !Number.isSafeInteger(body.ordinal) ||
        Number(body.ordinal) < 1 ||
        !['IN_PERSON', 'ONLINE', 'HYBRID'].includes(string(body.deliveryMode))
      )
        return invalid();
      const room = body.roomId ? find(state, 'rooms', body.roomId) : null;
      if (body.roomId && !room) return invalid();
      const session = baseRecord(nextId(state), {
        cohortId: cohort.id,
        cohort,
        cohortModuleId: cohortModule.id,
        module: find(state, 'modules', cohortModule.moduleId) ?? null,
        roomId: room?.id ?? null,
        room,
        ordinal: body.ordinal,
        deliveryMode: body.deliveryMode,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        status: 'SCHEDULED',
        attendanceWindowState: 'CLOSED',
        attendanceLockedAt: null,
        trainers: [],
        coordinatorName: 'Demo Owner',
      });
      const trainers = trainersFor(
        state,
        body.trainers ?? [],
        session.id,
        string(body.startsAt),
        string(body.endsAt),
      );
      if (!trainers) return invalid();
      session.trainers = trainers;
      if (hasBookingConflict(state, session)) return failure('SESSION_CONFLICT', 409);
      records(state, 'sessions').push(session);
      audit(state, 'session.created', session, 'SESSION');
      return json(session, 201);
    }
    const session = find(state, 'sessions', path[1]);
    if (!session) return notFound();
    if (method === 'GET' && path.length === 2) return json(session);
    if (path[2] === 'attendance' && method === 'GET')
      return json({ session, items: roster(state, session), nextCursor: null });
    if (path[2] === 'attendance-anomalies' && method === 'GET')
      return json({ items: [], nextCursor: null });
    if (method !== 'POST') return unsupported();
    if (path[2] === 'attendance' && path[3] === 'manual') {
      const enrollment = find(state, 'enrollments', body.enrollmentId);
      if (
        !enrollment ||
        enrollment.cohortId !== session.cohortId ||
        !['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(string(body.status)) ||
        !required(body.reason, 500)
      )
        return invalid();
      if (
        records(state, 'attendance').some(
          (item) => item.sessionId === session.id && item.enrollmentId === enrollment.id,
        )
      )
        return failure('ATTENDANCE_ALREADY_RECORDED', 409);
      const item = baseRecord(nextId(state), {
        sessionId: session.id,
        enrollmentId: enrollment.id,
        status: body.status,
        effectiveStatus: body.status,
        reason: body.reason,
        source: 'MANUAL',
        recordedAt: timestamp(),
        recordedByUserId: ownerId,
      });
      records(state, 'attendance').push(item);
      audit(state, 'attendance.recorded', item, 'ATTENDANCE');
      return json(item, 201);
    }
    const conflict = versionConflict(ctx, session);
    if (conflict) return conflict;
    if (path[2] === 'attendance-window' && ['open', 'close'].includes(path[3] ?? '')) {
      bump(session, { attendanceWindowState: path[3] === 'open' ? 'OPEN' : 'CLOSED' });
      return json(
        { sessionId: session.id, state: session.attendanceWindowState, version: session.version },
        201,
      );
    }
    if (path[2] === 'reschedule') {
      if (
        !required(body.reason, 500) ||
        !Number.isFinite(Date.parse(string(body.startsAt))) ||
        !Number.isFinite(Date.parse(string(body.endsAt))) ||
        Date.parse(string(body.endsAt)) <= Date.parse(string(body.startsAt))
      )
        return invalid();
      const room = body.roomId ? find(state, 'rooms', body.roomId) : session.room;
      if (body.roomId && !room) return invalid();
      const trainers = trainersFor(
        state,
        body.trainers ?? session.trainers,
        session.id,
        string(body.startsAt),
        string(body.endsAt),
      );
      if (!trainers) return invalid();
      const updates = {
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        trainers,
        room,
        roomId: body.roomId ?? session.roomId,
      };
      if (hasBookingConflict(state, { ...session, ...updates }))
        return failure('SESSION_CONFLICT', 409);
      bump(session, updates);
    } else if (path[2] === 'cancel' || path[2] === 'complete') {
      if (session.status !== 'SCHEDULED' || (path[2] === 'cancel' && !required(body.reason, 500)))
        return invalid();
      bump(session, {
        status: path[2] === 'cancel' ? 'CANCELLED' : 'COMPLETED',
        attendanceWindowState: 'CLOSED',
      });
    } else return unsupported();
    audit(state, `session.${path[2]}`, session, 'SESSION');
    return json(session, 201);
  }
  if (path[0] === 'attendance') {
    const item = find(state, 'attendance', path[1]);
    if (!item) return notFound();
    if (method === 'GET')
      return json({
        ...item,
        session: find(state, 'sessions', item.sessionId),
        enrollment: find(state, 'enrollments', item.enrollmentId),
        events: [],
        makeup: null,
      });
    if (method === 'POST' && path[2] === 'corrections') {
      const conflict = versionConflict(ctx, item);
      if (conflict) return conflict;
      if (
        !['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(string(body.status)) ||
        !required(body.reason, 500)
      )
        return invalid();
      bump(item, {
        status: body.status,
        effectiveStatus: body.status,
        reason: body.reason,
        source: 'CORRECTION',
      });
      audit(state, 'attendance.corrected', item, 'ATTENDANCE');
      return json(item, 201);
    }
    return unsupported();
  }
  if (path[0] === 'attendance-policies' && method === 'GET')
    return page(records(state, 'attendancePolicies'), url);
  if (path[0] === 'enrollments' && path[2] === 'attendance-summary' && method === 'GET') {
    const enrollment = find(state, 'enrollments', path[1]);
    if (!enrollment) return notFound();
    const all = records(state, 'attendance').filter((item) => item.enrollmentId === enrollment.id);
    const present = all.filter(
      (item) => item.status === 'PRESENT' || item.status === 'LATE',
    ).length;
    return json({
      enrollmentId: enrollment.id,
      denominator: all.length,
      numerator: present,
      ratio: all.length ? (present / all.length).toFixed(4) : '0.0000',
      minimumRatio: '0.8000',
      statusCounts: {
        PRESENT: all.filter((item) => item.status === 'PRESENT').length,
        LATE: all.filter((item) => item.status === 'LATE').length,
        ABSENT: all.filter((item) => item.status === 'ABSENT').length,
        EXCUSED: all.filter((item) => item.status === 'EXCUSED').length,
      },
      makeupCredits: 0,
      policyId: null,
      meetsPolicy: all.length > 0 && present / all.length >= 0.8,
    });
  }
  return null;
}
