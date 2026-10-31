import { calculateAttendanceRatio, type AttendanceStatus } from '@academyops/contracts';
import type { PrismaService } from '../platform/database/prisma.service';

export async function studentAttendanceView(
  prisma: PrismaService,
  organizationId: string,
  enrollmentIds: string[],
) {
  const records = await prisma.attendanceRecord.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
    select: { id: true, enrollmentId: true, currentStatus: true },
  });
  const recordIds = records.map(({ id }) => id);
  const makeupCredits = await prisma.makeupCredit.findMany({
    where: {
      organizationId,
      OR: [{ missedRecordId: { in: recordIds } }, { makeupRecordId: { in: recordIds } }],
    },
    select: { missedRecordId: true, makeupRecordId: true },
  });
  return new Map(
    enrollmentIds.map((enrollmentId) => {
      const enrollmentRecords = records.filter((record) => record.enrollmentId === enrollmentId);
      const statuses = enrollmentRecords.map(({ currentStatus }) => currentStatus);
      if (!statuses.length) return [enrollmentId, null];
      const count = (status: AttendanceStatus) =>
        statuses.filter((value) => value === status).length;
      const attendanceRatio = calculateAttendanceRatio(
        enrollmentRecords.map(({ id, currentStatus }) => ({
          recordId: id,
          status: currentStatus as AttendanceStatus,
        })),
        makeupCredits,
      );
      return [
        enrollmentId,
        {
          total: statuses.length,
          present: count('PRESENT'),
          absent: count('ABSENT'),
          late: count('LATE'),
          excused: count('EXCUSED'),
          rate:
            attendanceRatio.ratio === null ? null : Math.round(attendanceRatio.ratio * 10000) / 100,
        },
      ];
    }),
  );
}
