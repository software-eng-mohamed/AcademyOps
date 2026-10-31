import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CertificateEligibilityService } from '../src/certificates/certificate-eligibility.service';
import type { CertificateRulesService } from '../src/certificates/certificate-rules.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { studentAttendanceView } from '../src/students/student-attendance-view';

type Record = { id: string; enrollmentId: string; currentStatus: string };

describe('student learning attendance matches certificate eligibility', () => {
  it.each([
    [['PRESENT', 'EXCUSED'], 100],
    [['PRESENT', 'LATE', 'ABSENT', 'UNMARKED', 'EXCUSED'], 66.67],
    [['EXCUSED', 'UNMARKED'], null],
  ] as const)('uses the shared denominator for %j', async (statuses, expectedRate) => {
    const records = statuses.map((currentStatus, index) => ({
      id: `record-${index}`,
      enrollmentId: 'enrollment-a',
      currentStatus,
    }));
    const database = fixture(records);
    const views = await studentAttendanceView(
      database as unknown as PrismaService,
      'organization-a',
      ['enrollment-a'],
    );
    const certificate = await eligibility(database);
    expect(views.get('enrollment-a')?.rate).toBe(expectedRate);
    expect(views.get('enrollment-a')?.rate).toBe(
      certificate.ratio.ratio === null ? null : Math.round(certificate.ratio.ratio * 10000) / 100,
    );
    expect(views.get('enrollment-a')?.total).toBe(statuses.length);
  });

  it('credits makeup once, ignores another enrollment, and preserves raw status counts', async () => {
    const database = fixture(
      [
        { id: 'missed', enrollmentId: 'enrollment-a', currentStatus: 'ABSENT' },
        { id: 'makeup', enrollmentId: 'enrollment-a', currentStatus: 'LATE' },
        { id: 'other', enrollmentId: 'enrollment-b', currentStatus: 'ABSENT' },
      ],
      [
        { missedRecordId: 'missed', makeupRecordId: 'makeup' },
        { missedRecordId: 'missed', makeupRecordId: 'makeup' },
        { missedRecordId: 'other', makeupRecordId: 'makeup' },
      ],
    );
    const views = await studentAttendanceView(
      database as unknown as PrismaService,
      'organization-a',
      ['enrollment-a', 'enrollment-b', 'no-records'],
    );
    expect(views.get('enrollment-a')).toEqual({
      total: 2,
      present: 0,
      absent: 1,
      late: 1,
      excused: 0,
      rate: 100,
    });
    expect(views.get('enrollment-b')?.rate).toBe(0);
    expect(views.get('no-records')).toBeNull();
    expect(database.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          enrollmentId: { in: ['enrollment-a', 'enrollment-b', 'no-records'] },
        },
      }),
    );
    expect(database.makeupCredit.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-a',
        OR: [
          { missedRecordId: { in: ['missed', 'makeup', 'other'] } },
          { makeupRecordId: { in: ['missed', 'makeup', 'other'] } },
        ],
      },
      select: { missedRecordId: true, makeupRecordId: true },
    });
  });
});

function fixture(
  records: Record[],
  credits: { missedRecordId: string; makeupRecordId: string }[] = [],
) {
  return {
    attendanceRecord: { findMany: vi.fn().mockResolvedValue(records) },
    makeupCredit: { findMany: vi.fn().mockResolvedValue(credits) },
    enrollment: {
      findFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'enrollment-a',
        programVersionId: 'program-a',
        state: 'ACTIVE',
      }),
    },
    enrollmentCohortAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
    ledgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
    ledgerAllocation: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function eligibility(database: ReturnType<typeof fixture>) {
  const service = new CertificateEligibilityService({
    resolve: vi.fn().mockResolvedValue({ minimumRatio: new Prisma.Decimal('0.8') }),
  } as unknown as CertificateRulesService);
  return service.snapshot(database as unknown as PrismaService, 'organization-a', 'enrollment-a');
}
