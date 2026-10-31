import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { calculateAttendanceRatio } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { AttendanceAccessService } from './attendance-access.service';
import { AttendancePolicyService } from './attendance-policy.service';
import type { ListAttendanceAnomaliesDto, ListAttendanceRosterDto } from './attendance.dto';
@Injectable()
export class AttendanceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AttendanceAccessService,
    private readonly policies: AttendancePolicyService,
  ) {}
  async sessionRoster(access: AccessContext, sessionId: string, input: ListAttendanceRosterDto) {
    return this.prisma.$transaction(async (transaction) => {
      const session = await this.accessService.assertSession(
        transaction,
        access,
        'attendance.read',
        sessionId,
      );
      const at = session.startsAt ?? session.endsAt;
      const scopes = access.grants.get('attendance.read');
      const selfOnly =
        scopes?.has('S') && !(['O', 'B', 'A'] as const).some((scope) => scopes.has(scope));
      const ownEnrollments = selfOnly
        ? await transaction.enrollment.findMany({
            where: {
              organizationId: access.organizationId,
              studentPersonId: { in: access.studentPersonId ? [access.studentPersonId] : [] },
            },
            select: { id: true },
          })
        : undefined;
      const assignments = await transaction.enrollmentCohortAssignment.findMany({
        where: {
          organizationId: access.organizationId,
          cohortId: session.cohortId,
          ...(input.cursor ? { enrollmentId: { gt: input.cursor } } : {}),
          ...(ownEnrollments
            ? { AND: { enrollmentId: { in: ownEnrollments.map(({ id }) => id) } } }
            : {}),
          ...(at
            ? {
                startsAt: { lte: at },
                OR: [{ endsAt: null }, { endsAt: { gt: at } }],
              }
            : {}),
        },
        select: { enrollmentId: true },
        distinct: ['enrollmentId'],
        orderBy: { enrollmentId: 'asc' },
        take: input.limit + 1,
      });
      const page = assignments.slice(0, input.limit);
      const enrollmentIds = page.map(({ enrollmentId }) => enrollmentId);
      const [enrollments, records] = await Promise.all([
        transaction.enrollment.findMany({
          where: { organizationId: access.organizationId, id: { in: enrollmentIds } },
        }),
        transaction.attendanceRecord.findMany({
          where: {
            organizationId: access.organizationId,
            sessionId: session.id,
            enrollmentId: { in: enrollmentIds },
          },
        }),
      ]);
      const people = await transaction.person.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: enrollments.map(({ studentPersonId }) => studentPersonId) },
        },
        select: { id: true, publicId: true, name: true },
      });
      const items = page.flatMap(({ enrollmentId }) => {
        const enrollment = enrollments.find(({ id }) => id === enrollmentId);
        if (!enrollment) return [];
        const student = people.find(({ id }) => id === enrollment.studentPersonId) ?? null;
        const record =
          records.find((candidate) => candidate.enrollmentId === enrollment.id) ?? null;
        return [
          {
            enrollmentId: enrollment.id,
            student,
            attendance: record
              ? {
                  id: record.id,
                  status: record.currentStatus,
                  source: record.source,
                  recordedAt: record.recordedAt.toISOString(),
                  version: record.version,
                }
              : null,
            effectiveStatus: record?.currentStatus ?? 'UNMARKED',
          },
        ];
      });
      return {
        session: {
          id: session.id,
          status: session.status,
          attendanceWindowState: session.attendanceWindowState,
          startsAt: session.startsAt?.toISOString() ?? null,
          endsAt: session.endsAt?.toISOString() ?? null,
          version: session.version,
        },
        items,
        nextCursor:
          assignments.length > input.limit ? (page[page.length - 1]?.enrollmentId ?? null) : null,
      };
    });
  }
  async record(access: AccessContext, recordId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const { record, session } = await this.accessService.assertRecord(
        transaction,
        access,
        'attendance.read',
        recordId,
      );
      const [enrollment, events, makeupAsMissed, makeupAsAttended] = await Promise.all([
        transaction.enrollment.findFirstOrThrow({
          where: { organizationId: access.organizationId, id: record.enrollmentId },
        }),
        transaction.attendanceEvent.findMany({
          where: { organizationId: access.organizationId, attendanceRecordId: record.id },
          orderBy: { version: 'asc' },
        }),
        transaction.makeupCredit.findFirst({
          where: { organizationId: access.organizationId, missedRecordId: record.id },
        }),
        transaction.makeupCredit.findFirst({
          where: { organizationId: access.organizationId, makeupRecordId: record.id },
        }),
      ]);
      const student = await transaction.person.findFirstOrThrow({
        where: { organizationId: access.organizationId, id: enrollment.studentPersonId },
        select: { id: true, publicId: true, name: true },
      });
      return {
        ...record,
        recordedAt: record.recordedAt.toISOString(),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        session: {
          id: session.id,
          startsAt: session.startsAt?.toISOString() ?? null,
          endsAt: session.endsAt?.toISOString() ?? null,
          attendanceWindowState: session.attendanceWindowState,
        },
        enrollment: { id: enrollment.id, state: enrollment.state, student },
        events: events.map((event) => ({
          ...event,
          occurredAt: event.occurredAt.toISOString(),
        })),
        makeup: {
          compensatesRecordId: makeupAsAttended?.missedRecordId ?? null,
          compensatedByRecordId: makeupAsMissed?.makeupRecordId ?? null,
        },
      };
    });
  }
  async enrollmentSummary(access: AccessContext, enrollmentId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const enrollment = await this.accessService.assertEnrollment(
        transaction,
        access,
        'attendance.read',
        enrollmentId,
      );
      const records = await transaction.attendanceRecord.findMany({
        where: { organizationId: access.organizationId, enrollmentId: enrollment.id },
        orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
      });
      const recordIds = records.map(({ id }) => id);
      const makeupCredits = await transaction.makeupCredit.findMany({
        where: {
          organizationId: access.organizationId,
          OR: [{ missedRecordId: { in: recordIds } }, { makeupRecordId: { in: recordIds } }],
        },
      });
      const ratio = calculateAttendanceRatio(
        records.map((record) => ({
          recordId: record.id,
          status: record.currentStatus as 'UNMARKED' | 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED',
        })),
        makeupCredits,
      );
      const latestAssignment = await transaction.enrollmentCohortAssignment.findFirst({
        where: { organizationId: access.organizationId, enrollmentId: enrollment.id },
        orderBy: { startsAt: 'desc' },
      });
      const policy = latestAssignment
        ? await this.policies.resolve(
            transaction,
            access.organizationId,
            enrollment.programVersionId,
            latestAssignment.cohortId,
            new Date(),
          )
        : {
            id: null,
            minimumRatio: 0.8,
            lockAfterMinutes: 1440,
            checkInOpensBeforeMinutes: 30,
            checkInClosesAfterMinutes: 30,
          };
      const statusCounts = records.reduce<Record<string, number>>((counts, record) => {
        counts[record.currentStatus] = (counts[record.currentStatus] ?? 0) + 1;
        return counts;
      }, {});
      return {
        enrollmentId: enrollment.id,
        numerator: ratio.numerator,
        denominator: ratio.denominator,
        ratio: ratio.ratio === null ? null : ratio.ratio.toFixed(4),
        minimumRatio: policy.minimumRatio.toFixed(4),
        meetsPolicy: ratio.ratio !== null && ratio.ratio >= policy.minimumRatio,
        statusCounts,
        makeupCredits: makeupCredits.length,
        policyId: policy.id,
      };
    });
  }
  async anomalies(access: AccessContext, sessionId: string, input: ListAttendanceAnomaliesDto) {
    return this.prisma.$transaction(async (transaction) => {
      await this.accessService.assertSession(
        transaction,
        access,
        'reports.operations.read',
        sessionId,
      );
      const anomalies = await transaction.attendanceAnomaly.findMany({
        where: { organizationId: access.organizationId, sessionId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const page = anomalies.slice(0, input.limit);
      return {
        items: page.map((anomaly) => ({
          ...anomaly,
          occurredAt: anomaly.occurredAt.toISOString(),
        })),
        nextCursor: anomalies.length > input.limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    });
  }
}
