import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  attendanceBand,
  attendanceScore,
  cairoMidnight,
  cairoParts,
  isCountedAttendance,
  TrendPoint,
} from './dashboard-utils';

@Injectable()
export class DashboardMetricsService {
  computeOutstanding(
    debitEntries: Array<{ id: string; amount: Prisma.Decimal }>,
    allocations: Array<{ debitEntryId: string; _sum: { amount: Prisma.Decimal | null } }>,
  ): { outstanding: Prisma.Decimal; allocatedByDebit: Map<string, Prisma.Decimal> } {
    const allocatedByDebit = new Map(
      allocations.map(({ debitEntryId, _sum }) => [
        debitEntryId,
        _sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    const outstanding = debitEntries.reduce(
      (sum, entry) =>
        sum.add(
          Prisma.Decimal.max(
            entry.amount.sub(allocatedByDebit.get(entry.id) ?? new Prisma.Decimal(0)),
            0,
          ),
        ),
      new Prisma.Decimal(0),
    );
    return { outstanding, allocatedByDebit };
  }

  collectionsFor(
    payments: Array<{ id: string; amount: Prisma.Decimal; receivedAt: Date }>,
    visibleRefunds: Array<{ paymentId: string; amount: Prisma.Decimal; processedAt: Date }>,
    visibleReversals: Array<{ paymentId: string; occurredAt: Date }>,
    paymentById: Map<string, { id: string; amount: Prisma.Decimal; receivedAt: Date }>,
    from: Date,
    to: Date,
  ): Prisma.Decimal {
    const gross = payments
      .filter(({ receivedAt }) => receivedAt >= from && receivedAt < to)
      .reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
    const refunded = visibleRefunds
      .filter(({ processedAt }) => processedAt >= from && processedAt < to)
      .reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
    const reversed = visibleReversals
      .filter(({ occurredAt }) => occurredAt >= from && occurredAt < to)
      .reduce(
        (sum, item) => sum.add(paymentById.get(item.paymentId)?.amount ?? 0),
        new Prisma.Decimal(0),
      );
    return gross.sub(refunded).sub(reversed);
  }

  computeAttendance(
    attendanceRecords: Array<{
      id: string;
      sessionId: string;
      enrollmentId: string;
      currentStatus: string;
    }>,
    currentMonthSessionIds: Set<string>,
    actualMakeupCredits: Array<{ missedRecordId: string }>,
    activeEnrollments: Array<{ id: string; studentPersonId: string }>,
  ) {
    const makeupMissedIds = new Set(
      actualMakeupCredits.map(({ missedRecordId }) => missedRecordId),
    );
    const currentAttendance = attendanceRecords.filter(({ sessionId }) =>
      currentMonthSessionIds.has(sessionId),
    );
    const attendanceValue = (record: (typeof attendanceRecords)[number]) =>
      attendanceScore(record.currentStatus, makeupMissedIds.has(record.id));
    const attendanceDenominator = currentAttendance.filter(({ currentStatus }) =>
      isCountedAttendance(currentStatus),
    ).length;
    const attendanceNumerator = currentAttendance.reduce(
      (sum, record) => sum + attendanceValue(record),
      0,
    );
    const attendanceRate = attendanceDenominator
      ? attendanceNumerator / attendanceDenominator
      : null;

    const byEnrollment = new Map<string, { numerator: number; denominator: number }>();
    for (const record of currentAttendance) {
      if (!isCountedAttendance(record.currentStatus)) continue;
      const value = byEnrollment.get(record.enrollmentId) ?? { numerator: 0, denominator: 0 };
      value.denominator += 1;
      value.numerator += attendanceValue(record);
      byEnrollment.set(record.enrollmentId, value);
    }
    const attendanceHealth = { healthy: 0, nearThreshold: 0, belowMinimum: 0, noData: 0 };
    for (const enrollment of activeEnrollments) {
      const value = byEnrollment.get(enrollment.id);
      if (!value?.denominator) attendanceHealth.noData += 1;
      else {
        const ratio = value.numerator / value.denominator;
        const band = attendanceBand(ratio);
        if (band === 'BELOW_MINIMUM') attendanceHealth.belowMinimum += 1;
        else if (band === 'NEAR_THRESHOLD') attendanceHealth.nearThreshold += 1;
        else attendanceHealth.healthy += 1;
      }
    }

    return { attendanceRate, byEnrollment, attendanceHealth };
  }

  monthPoints(year: number, month: number, value: (from: Date, to: Date) => number): TrendPoint[] {
    return Array.from({ length: 6 }, (_, index) => {
      const offset = index - 5;
      const from = cairoMidnight(year, month + offset, 1);
      const to = cairoMidnight(year, month + offset + 1, 1);
      return {
        period: `${cairoParts(from).year}-${String(cairoParts(from).month).padStart(2, '0')}`,
        value: value(from, to),
      };
    });
  }

  monthPointsForRange(
    fromMonth: string,
    toMonth: string,
    value: (from: Date, to: Date) => number,
  ): TrendPoint[] {
    const [fromYear = 0, fromValue = 0] = fromMonth.split('-').map(Number);
    const [toYear = 0, toValue = 0] = toMonth.split('-').map(Number);
    const length = (toYear - fromYear) * 12 + toValue - fromValue + 1;
    return Array.from({ length }, (_, index) => {
      const from = cairoMidnight(fromYear, fromValue + index, 1);
      const to = cairoMidnight(fromYear, fromValue + index + 1, 1);
      return {
        period: `${cairoParts(from).year}-${String(cairoParts(from).month).padStart(2, '0')}`,
        value: value(from, to),
      };
    });
  }
}
