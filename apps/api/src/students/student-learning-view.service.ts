import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { StudentScopePolicyService } from './student-scope-policy.service';
import { studentAttendanceView } from './student-attendance-view';
@Injectable()
export class StudentLearningViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopePolicy: StudentScopePolicyService,
  ) {}
  async summaries(access: AccessContext, personIds: string[]) {
    const ids = await this.scopePolicy.visibleEnrollmentIds(
      access,
      personIds,
      'students.read_basic',
    );
    const core = await this.core(access.organizationId, ids);
    const byPerson = new Map<string, (typeof core)[number][]>();
    for (const enrollment of core) {
      const current = byPerson.get(enrollment.studentPersonId) ?? [];
      current.push(enrollment);
      byPerson.set(enrollment.studentPersonId, current);
    }
    return new Map(
      personIds.map((personId) => {
        const enrollments = byPerson.get(personId) ?? [];
        const current =
          enrollments.find(({ state }) => state === 'ACTIVE') ?? enrollments.at(0) ?? null;
        return [
          personId,
          {
            total: enrollments.length,
            active: enrollments.filter(({ state }) => state === 'ACTIVE').length,
            latestState: current?.state ?? null,
            program: current?.program ?? null,
            cohort: current?.cohort ?? null,
            branch: current?.branch ?? null,
          },
        ];
      }),
    );
  }
  async details(access: AccessContext, personId: string) {
    const ids = await this.scopePolicy.visibleEnrollmentIds(
      access,
      [personId],
      'students.read_basic',
    );
    const core = await this.core(access.organizationId, ids);
    if (!core.length) return [];
    const canReadFinance =
      access.grants.has('pricing.read') || access.grants.has('finance.balance.read');
    const canReadAttendance = access.grants.has('attendance.read');
    const canReadCertificates = access.grants.has('certificates.read');
    const [finance, attendance, certificates, sources] = await Promise.all([
      canReadFinance ? this.finance(access.organizationId, ids) : Promise.resolve(null),
      canReadAttendance
        ? studentAttendanceView(this.prisma, access.organizationId, ids)
        : Promise.resolve(null),
      canReadCertificates ? this.certificates(access.organizationId, ids) : Promise.resolve(null),
      this.sources(access.organizationId, ids, canReadFinance),
    ] as const);
    return core.map((enrollment) => ({
      ...enrollment,
      ...(canReadFinance ? { finance: finance?.get(enrollment.id) ?? null } : {}),
      ...(canReadAttendance ? { attendance: attendance?.get(enrollment.id) ?? null } : {}),
      ...(canReadCertificates ? { certificate: certificates?.get(enrollment.id) ?? null } : {}),
      source: sources.get(enrollment.id) ?? null,
    }));
  }
  private async core(organizationId: string, enrollmentIds: string[]) {
    if (!enrollmentIds.length) return [];
    const enrollments = await this.prisma.enrollment.findMany({
      where: { organizationId, id: { in: enrollmentIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        studentPersonId: true,
        state: true,
        kind: true,
        homeBranchId: true,
        programVersionId: true,
        activatedAt: true,
        completedAt: true,
        cancelledAt: true,
        version: true,
        createdAt: true,
      },
    });
    const [versions, assignments, branches] = await Promise.all([
      this.prisma.programVersion.findMany({
        where: {
          organizationId,
          id: { in: enrollments.map(({ programVersionId }) => programVersionId) },
        },
        select: { id: true, programId: true, version: true, status: true },
      }),
      this.prisma.enrollmentCohortAssignment.findMany({
        where: { organizationId, enrollmentId: { in: enrollmentIds }, endsAt: null },
        orderBy: { startsAt: 'desc' },
        select: { enrollmentId: true, cohortId: true, startsAt: true },
      }),
      this.prisma.branch.findMany({
        where: { organizationId, id: { in: enrollments.map(({ homeBranchId }) => homeBranchId) } },
        select: { id: true, code: true, name: true },
      }),
    ]);
    const [programs, cohorts] = await Promise.all([
      this.prisma.program.findMany({
        where: { organizationId, id: { in: versions.map(({ programId }) => programId) } },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.cohort.findMany({
        where: { organizationId, id: { in: assignments.map(({ cohortId }) => cohortId) } },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          startsOn: true,
          endsOn: true,
        },
      }),
    ]);
    return enrollments.map((enrollment) => {
      const programVersion = versions.find(({ id }) => id === enrollment.programVersionId) ?? null;
      const assignment = assignments.find(({ enrollmentId }) => enrollmentId === enrollment.id);
      return {
        ...enrollment,
        programVersion,
        program: programs.find(({ id }) => id === programVersion?.programId) ?? null,
        cohort: cohorts.find(({ id }) => id === assignment?.cohortId) ?? null,
        cohortStartedAt: assignment?.startsAt ?? null,
        branch: branches.find(({ id }) => id === enrollment.homeBranchId) ?? null,
      };
    });
  }
  private async finance(organizationId: string, enrollmentIds: string[]) {
    const [agreements, entries, payments] = await Promise.all([
      this.prisma.pricingAgreement.findMany({
        where: { organizationId, enrollmentId: { in: enrollmentIds }, status: 'APPROVED' },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        select: {
          enrollmentId: true,
          subtotal: true,
          discountAmount: true,
          totalAmount: true,
          status: true,
          version: true,
        },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { organizationId, enrollmentId: { in: enrollmentIds } },
        select: { enrollmentId: true, direction: true, amount: true },
      }),
      this.prisma.payment.findMany({
        where: { organizationId, enrollmentId: { in: enrollmentIds }, status: 'POSTED' },
        select: { enrollmentId: true, amount: true },
      }),
    ]);
    return new Map(
      enrollmentIds.map((enrollmentId) => {
        const agreement = agreements.find((entry) => entry.enrollmentId === enrollmentId) ?? null;
        const ledger = entries.filter((entry) => entry.enrollmentId === enrollmentId);
        const postedPayments = payments.filter((payment) => payment.enrollmentId === enrollmentId);
        const outstanding = ledger.reduce(
          (total, entry) => total + Number(entry.amount) * (entry.direction === 'DEBIT' ? 1 : -1),
          0,
        );
        return [
          enrollmentId,
          {
            currencyCode: 'EGP',
            subtotal: agreement ? Number(agreement.subtotal) : null,
            discountAmount: agreement ? Number(agreement.discountAmount) : null,
            totalAmount: agreement ? Number(agreement.totalAmount) : null,
            paidAmount: postedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
            outstandingBalance: Math.max(0, outstanding),
            paymentCount: postedPayments.length,
          },
        ];
      }),
    );
  }
  private async certificates(organizationId: string, enrollmentIds: string[]) {
    const [issued, importedStatuses] = await Promise.all([
      this.prisma.certificate.findMany({
        where: { organizationId, enrollmentId: { in: enrollmentIds } },
        orderBy: { issuedAt: 'desc' },
        select: {
          enrollmentId: true,
          id: true,
          serial: true,
          validityStatus: true,
          fulfillmentStatus: true,
          pdfStatus: true,
          issuedAt: true,
        },
      }),
      this.prisma.legacyReference.findMany({
        where: {
          organizationId,
          entityType: 'CERTIFICATE_HISTORY',
          entityId: { in: enrollmentIds },
          sourceField: 'CERTIFICATE_STATUS',
        },
        select: { entityId: true, rawValue: true },
      }),
    ]);
    return new Map(
      enrollmentIds.map((enrollmentId) => {
        const certificates = issued.filter((entry) => entry.enrollmentId === enrollmentId);
        const importedStatus =
          importedStatuses.find(({ entityId }) => entityId === enrollmentId)?.rawValue ?? null;
        if (!certificates.length && !importedStatus) return [enrollmentId, null];
        return [
          enrollmentId,
          { importedStatus, issuedCount: certificates.length, latest: certificates.at(0) ?? null },
        ];
      }),
    );
  }
  private async sources(organizationId: string, enrollmentIds: string[], includeFinance: boolean) {
    const references = await this.prisma.legacyReference.findMany({
      where: {
        organizationId,
        entityType: 'ENROLLMENT',
        entityId: { in: enrollmentIds },
        sourceField: 'MASTER_ROW',
      },
      select: { entityId: true, importRowId: true },
    });
    const rows = await this.prisma.importRow.findMany({
      where: { organizationId, id: { in: references.map(({ importRowId }) => importRowId) } },
      select: {
        id: true,
        rowNumber: true,
        rawValues: true,
        normalizedValues: true,
        createdAt: true,
      },
    });
    return new Map(
      references.map((reference) => {
        const row = rows.find(({ id }) => id === reference.importRowId);
        const raw = (row?.rawValues ?? {}) as Prisma.JsonObject;
        const normalized = (row?.normalizedValues ?? {}) as Prisma.JsonObject;
        return [
          reference.entityId,
          {
            legacyCode: this.rawText(normalized.legacyCode) ?? this.rawText(raw.A),
            legacyState: this.rawText(normalized.state) ?? this.rawText(raw.B),
            telesalesAgent: this.rawText(normalized.telesalesAgent) ?? this.rawText(raw.C),
            acquisitionSource: this.rawText(normalized.acquisitionSource) ?? this.rawText(raw.H),
            secondaryCode: this.rawText(normalized.secondaryCode) ?? this.rawText(raw.J),
            deliveryMode: this.rawText(normalized.deliveryMode) ?? this.rawText(raw.L),
            rowNumber: row?.rowNumber ?? null,
            importedAt: row?.createdAt ?? null,
            ...(includeFinance
              ? {
                  workbookShouldPaid:
                    this.rawNumber(normalized.workbookShouldPaid) ?? this.rawNumber(raw.R),
                  workbookRemaining:
                    this.rawNumber(normalized.workbookRemaining) ?? this.rawNumber(raw.S),
                }
              : {}),
          },
        ];
      }),
    );
  }
  private rawText(value: Prisma.JsonValue | undefined): string | null {
    if (typeof value === 'string' || typeof value === 'number') return `${value}`.trim() || null;
    return null;
  }
  private rawNumber(value: Prisma.JsonValue | undefined): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
