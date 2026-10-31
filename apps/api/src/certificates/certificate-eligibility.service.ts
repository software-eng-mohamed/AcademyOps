import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext, AttendanceStatus } from '@academyops/contracts';
import { calculateAttendanceRatio } from '@academyops/contracts';
import { CertificateRulesService } from './certificate-rules.service';

@Injectable()
export class CertificateEligibilityService {
  constructor(private readonly rules: CertificateRulesService) {}

  async snapshot(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    enrollmentId: string,
  ) {
    const enrollment = await transaction.enrollment.findFirstOrThrow({
      where: { organizationId, id: enrollmentId },
    });
    const latestAssignment = await transaction.enrollmentCohortAssignment.findFirst({
      where: { organizationId, enrollmentId },
      orderBy: { startsAt: 'desc' },
    });
    const now = new Date();
    const rule = await this.rules.resolve(
      transaction,
      organizationId,
      enrollment.programVersionId,
      latestAssignment?.cohortId ?? null,
      now,
    );
    if (!rule) {
      throw new ConflictException({
        code: 'CERTIFICATE_RULE_MISSING',
        messageKey: 'certificates.ruleMissing',
      });
    }

    const records = await transaction.attendanceRecord.findMany({
      where: { organizationId, enrollmentId },
    });
    const recordIds = records.map(({ id }) => id);
    const [makeupCredits, debits] = await Promise.all([
      transaction.makeupCredit.findMany({
        where: {
          organizationId,
          OR: [{ missedRecordId: { in: recordIds } }, { makeupRecordId: { in: recordIds } }],
        },
      }),
      transaction.ledgerEntry.findMany({
        where: { organizationId, enrollmentId, direction: 'DEBIT' },
      }),
    ]);
    const allocations = await transaction.ledgerAllocation.findMany({
      where: { organizationId, debitEntryId: { in: debits.map(({ id }) => id) } },
    });
    const allocatedByDebit = new Map<string, Prisma.Decimal>();
    for (const allocation of allocations) {
      const current = allocatedByDebit.get(allocation.debitEntryId) ?? new Prisma.Decimal(0);
      allocatedByDebit.set(allocation.debitEntryId, current.add(allocation.amount));
    }
    const outstanding = debits.reduce(
      (sum, debit) => sum.add(debit.amount.sub(allocatedByDebit.get(debit.id) ?? 0)),
      new Prisma.Decimal(0),
    );
    const ratio = calculateAttendanceRatio(
      records.map((record) => ({
        recordId: record.id,
        status: record.currentStatus as AttendanceStatus,
      })),
      makeupCredits,
    );
    const minimumRatio = Math.max(0.8, rule.minimumRatio.toNumber());
    const academicResult =
      ratio.ratio !== null && ratio.ratio >= minimumRatio ? 'ELIGIBLE' : 'INELIGIBLE';
    return {
      enrollment,
      rule,
      ratio,
      minimumRatio,
      academicResult,
      financialHold: outstanding.gt(0),
      outstanding,
      completionSatisfied: enrollment.state === 'COMPLETED',
    };
  }

  async evaluate(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    enrollmentId: string,
  ) {
    const snapshot = await this.snapshot(transaction, access.organizationId, enrollmentId);
    const evaluation = await transaction.eligibilityEvaluation.create({
      data: {
        organizationId: access.organizationId,
        enrollmentId,
        ruleVersionId: snapshot.rule.id,
        attendanceRatio:
          snapshot.ratio.ratio === null
            ? null
            : new Prisma.Decimal(snapshot.ratio.ratio.toFixed(4)),
        academicResult: snapshot.academicResult,
        financialHold: snapshot.financialHold,
        evidenceSnapshot: {
          numerator: snapshot.ratio.numerator,
          denominator: snapshot.ratio.denominator,
          minimumRatio: snapshot.minimumRatio.toFixed(4),
          outstanding: snapshot.outstanding.toFixed(2),
          completionSatisfied: snapshot.completionSatisfied,
          ruleVersionId: snapshot.rule.id,
        },
        evaluatedBy: access.actorUserId,
      },
    });
    return {
      id: evaluation.id,
      enrollmentId,
      attendanceRatio: evaluation.attendanceRatio?.toFixed(4) ?? null,
      minimumRatio: snapshot.minimumRatio.toFixed(4),
      academicResult: snapshot.academicResult,
      financialHold: snapshot.financialHold,
      outstanding: snapshot.outstanding.toFixed(2),
      completionSatisfied: snapshot.completionSatisfied,
      ruleVersionId: snapshot.rule.id,
    };
  }
}
