import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/database/prisma.service';
export type ReceivableRow = {
  enrollmentId: string;
  studentPublicId: string;
  studentName: string | null;
  branchCode: string;
  enrollmentState: string;
  debits: string;
  allocated: string;
  outstanding: string;
};
@Injectable()
export class ReportingQueryService {
  constructor(private readonly prisma: PrismaService) {}
  async receivableRows(
    organizationId: string,
    enrollmentIds: string[] | null,
    asOfExclusive?: Date,
  ): Promise<ReceivableRow[]> {
    if (enrollmentIds?.length === 0) return [];
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        organizationId,
        ...(enrollmentIds === null ? {} : { id: { in: enrollmentIds } }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        studentPersonId: true,
        homeBranchId: true,
        state: true,
      },
    });
    const enrollmentIdList = enrollments.map(({ id }) => id);
    const debits = await this.prisma.ledgerEntry.findMany({
      where: {
        organizationId,
        direction: 'DEBIT',
        enrollmentId: { in: enrollmentIdList },
        ...(asOfExclusive ? { postedAt: { lt: asOfExclusive } } : {}),
      },
      select: { id: true, enrollmentId: true, amount: true },
    });
    const allocations = await this.prisma.ledgerAllocation.groupBy({
      by: ['debitEntryId'],
      where: {
        organizationId,
        debitEntryId: { in: debits.map(({ id }) => id) },
        ...(asOfExclusive ? { allocatedAt: { lt: asOfExclusive } } : {}),
      },
      _sum: { amount: true },
    });
    const allocatedByDebit = new Map(
      allocations.map(({ debitEntryId, _sum }) => [
        debitEntryId,
        _sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    const totals = new Map<
      string,
      {
        debits: Prisma.Decimal;
        allocated: Prisma.Decimal;
        outstanding: Prisma.Decimal;
      }
    >();
    for (const debit of debits) {
      if (!debit.enrollmentId) continue;
      const current = totals.get(debit.enrollmentId) ?? {
        debits: new Prisma.Decimal(0),
        allocated: new Prisma.Decimal(0),
        outstanding: new Prisma.Decimal(0),
      };
      const allocated = allocatedByDebit.get(debit.id) ?? new Prisma.Decimal(0);
      current.debits = current.debits.add(debit.amount);
      current.allocated = current.allocated.add(allocated);
      current.outstanding = current.outstanding.add(
        Prisma.Decimal.max(debit.amount.sub(allocated), 0),
      );
      totals.set(debit.enrollmentId, current);
    }
    const [people, branches] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          organizationId,
          id: { in: enrollments.map(({ studentPersonId }) => studentPersonId) },
        },
        select: { id: true, publicId: true, name: true },
      }),
      this.prisma.branch.findMany({
        where: {
          organizationId,
          id: { in: enrollments.map(({ homeBranchId }) => homeBranchId) },
        },
        select: { id: true, code: true },
      }),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const branchById = new Map(branches.map((branch) => [branch.id, branch]));
    return enrollments.map((enrollment) => {
      const person = personById.get(enrollment.studentPersonId);
      const total = totals.get(enrollment.id) ?? {
        debits: new Prisma.Decimal(0),
        allocated: new Prisma.Decimal(0),
        outstanding: new Prisma.Decimal(0),
      };
      return {
        enrollmentId: enrollment.id,
        studentPublicId: person?.publicId ?? '',
        studentName: person?.name ?? null,
        branchCode: branchById.get(enrollment.homeBranchId)?.code ?? '',
        enrollmentState: enrollment.state,
        debits: total.debits.toFixed(2),
        allocated: total.allocated.toFixed(2),
        outstanding: total.outstanding.toFixed(2),
      };
    });
  }
}
