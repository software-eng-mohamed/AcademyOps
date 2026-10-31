import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { ImportCatalogWriter } from './import-catalog-writer';
import { ImportFinanceWriter } from './import-finance-writer';
import {
  recordContactMatchEvidence,
  reviewedCreateNewForRow,
  reviewedPersonForRow,
} from './import-person-identity';
import { masterEnrollmentKey, type MasterValue } from './import-values';
import { ImportStudentAccountWriter } from './import-student-account-writer';
type ImportRow = {
  id: string;
  rowHash: string;
  normalizedValues: Prisma.JsonValue | null;
};
@Injectable()
export class ImportStudentWriter {
  constructor(
    private readonly catalog: ImportCatalogWriter,
    private readonly finance: ImportFinanceWriter,
    private readonly accounts: ImportStudentAccountWriter = new ImportStudentAccountWriter(),
  ) {}
  async write(
    db: Prisma.TransactionClient,
    access: AccessContext,
    rows: ImportRow[],
  ): Promise<void> {
    const defaultBranch = await db.branch.findFirst({
      where: {
        organizationId: access.organizationId,
        ...(access.branchIds.size ? { id: { in: [...access.branchIds] } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!defaultBranch) throw this.conflict('IMPORT_BRANCH_REQUIRED');
    for (const row of rows) {
      const value = row.normalizedValues as unknown as MasterValue;
      const branch = await this.accounts.resolveBranch(
        db,
        access.organizationId,
        value.branch,
        defaultBranch,
      );
      const enrollmentKey = masterEnrollmentKey(value);
      const existingReference = await db.legacyReference.findFirst({
        where: {
          organizationId: access.organizationId,
          entityType: 'ENROLLMENT',
          sourceField: 'MASTER_ENROLLMENT_KEY',
          rawValue: enrollmentKey,
        },
      });
      if (existingReference && existingReference.importRowId !== row.id)
        throw this.conflict('IMPORT_ENROLLMENT_IDENTITY_COLLISION');
      let enrollment = existingReference
        ? await db.enrollment.findFirst({
            where: { id: existingReference.entityId, organizationId: access.organizationId },
          })
        : null;
      if (!enrollment) enrollment = await this.createEnrollment(db, access, branch.id, row, value);
      await this.finance.write(db, access, row, enrollment.id, enrollment.billingAccountId, value);
      await this.reference(
        db,
        access.organizationId,
        row.id,
        enrollment.id,
        'MASTER_ROW',
        enrollmentKey,
      );
      await this.reference(
        db,
        access.organizationId,
        row.id,
        enrollment.id,
        'ENROLLMENT_BRANCH',
        branch.code,
      );
      await this.reference(
        db,
        access.organizationId,
        row.id,
        enrollment.id,
        'ENROLLMENT_DELIVERY_MODE',
        value.deliveryMode || 'IN_PERSON',
      );
      await this.reference(
        db,
        access.organizationId,
        row.id,
        enrollment.id,
        'MASTER_ENROLLMENT_KEY',
        enrollmentKey,
      );
      await db.importRow.update({
        where: { id: row.id },
        data: { disposition: 'IMPORTED', targetType: 'ENROLLMENT', targetId: enrollment.id },
      });
    }
  }
  private async createEnrollment(
    db: Prisma.TransactionClient,
    access: AccessContext,
    branchId: string,
    row: ImportRow,
    value: MasterValue,
  ) {
    const person = await this.resolvePerson(db, access.organizationId, row, value);
    await this.personReference(db, access.organizationId, row.id, person.id, row.rowHash);
    await db.studentProfile.upsert({
      where: {
        organizationId_personId: {
          organizationId: access.organizationId,
          personId: person.id,
        },
      },
      update: {},
      create: { organizationId: access.organizationId, personId: person.id },
    });
    await this.accounts.contact(db, access.organizationId, person.id, 'PHONE', value.phone);
    await this.accounts.contact(db, access.organizationId, person.id, 'EMAIL', value.email);
    const cohort = await this.catalog.ensureLegacyCohort(
      db,
      access.organizationId,
      branchId,
      value.programCode,
      value.cohortCode,
    );
    const enrollmentKind = value.kind.toUpperCase().includes('CORPORATE')
      ? 'CORPORATE'
      : 'INDIVIDUAL';
    const billing = await this.accounts.billingAccount(
      db,
      access.organizationId,
      person.id,
      branchId,
      enrollmentKind,
    );
    const enrollment = await db.enrollment.create({
      data: {
        organizationId: access.organizationId,
        studentPersonId: person.id,
        programVersionId: cohort.programVersionId,
        billingAccountId: billing.id,
        homeBranchId: branchId,
        kind: enrollmentKind,
        state: 'DRAFT',
      },
    });
    const earliestSession = await db.session.findFirst({
      where: {
        organizationId: access.organizationId,
        cohortId: cohort.id,
        startsAt: { not: null },
      },
      orderBy: { startsAt: 'asc' },
      select: { startsAt: true },
    });
    const startCandidates = [
      earliestSession?.startsAt ?? null,
      ...value.payments.map((payment) => new Date(payment.receivedAt)),
    ].filter((date): date is Date => date instanceof Date);
    const startsAt = startCandidates.length
      ? new Date(Math.min(...startCandidates.map((date) => date.getTime())))
      : new Date();
    await db.enrollmentCohortAssignment.create({
      data: {
        organizationId: access.organizationId,
        enrollmentId: enrollment.id,
        cohortId: cohort.id,
        startsAt,
        reason: 'Legacy workbook import',
        createdBy: access.actorUserId,
      },
    });
    const active = await db.enrollment.update({
      where: { id: enrollment.id },
      data: { state: 'ACTIVE', activatedAt: startsAt },
    });
    const targetState = this.enrollmentState(value.state);
    if (targetState === 'ACTIVE') return active;
    return db.enrollment.update({
      where: { id: enrollment.id },
      data: {
        state: targetState,
        ...(targetState === 'COMPLETED' ? { completedAt: new Date() } : {}),
        ...(targetState === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      },
    });
  }
  private async resolvePerson(
    db: Prisma.TransactionClient,
    organizationId: string,
    row: ImportRow,
    value: MasterValue,
  ) {
    const [reviewed, createNew] = await Promise.all([
      reviewedPersonForRow(db, organizationId, row.id),
      reviewedCreateNewForRow(db, organizationId, row.id),
    ]);
    if (reviewed.mappingCount > 1 || (reviewed.mappingCount === 1 && !reviewed.person))
      throw this.conflict('IMPORT_REVIEWED_PERSON_MAPPING_INVALID');
    if (reviewed.person && createNew)
      throw this.conflict('IMPORT_PERSON_IDENTITY_DECISION_CONFLICT');
    await recordContactMatchEvidence(db, organizationId, row.id, value);
    if (reviewed.person) {
      return db.person.update({
        where: { id: reviewed.person.id },
        data: {
          ...(!reviewed.person.name && value.name ? { name: value.name } : {}),
        },
      });
    }
    const publicId = `LEGACY-${row.rowHash.slice(0, 23).toUpperCase()}`;
    return db.person.upsert({
      where: {
        organizationId_publicId: { organizationId, publicId },
      },
      update: {
        ...(value.name ? { name: value.name } : {}),
      },
      create: {
        organizationId,
        publicId,
        name: value.name || null,
      },
    });
  }
  private async personReference(
    db: Prisma.TransactionClient,
    organizationId: string,
    importRowId: string,
    personId: string,
    rowHash: string,
  ): Promise<void> {
    const where = {
      organizationId,
      importRowId,
      entityType: 'PERSON',
      entityId: personId,
      sourceField: 'IMPORTED_PERSON_IDENTITY',
      rawValue: rowHash,
    };
    if (!(await db.legacyReference.findFirst({ where })))
      await db.legacyReference.create({ data: where });
  }
  private enrollmentState(value: string): 'ACTIVE' | 'POSTPONED' | 'COMPLETED' | 'CANCELLED' {
    const state = value.toUpperCase();
    if (state.includes('CANCEL')) return 'CANCELLED';
    if (state.includes('POSTPONE')) return 'POSTPONED';
    if (state.includes('DONE') || state.includes('COMPLETE')) return 'COMPLETED';
    return 'ACTIVE';
  }
  private async reference(
    db: Prisma.TransactionClient,
    organizationId: string,
    importRowId: string,
    entityId: string,
    sourceField: string,
    rawValue: string,
  ): Promise<void> {
    const where = {
      organizationId,
      importRowId,
      entityType: 'ENROLLMENT',
      entityId,
      sourceField,
      rawValue,
    };
    if (!(await db.legacyReference.findFirst({ where }))) {
      await db.legacyReference.create({ data: where });
    }
  }
  private conflict(code: string): ConflictException {
    return new ConflictException({ code, messageKey: `imports.${code.toLowerCase()}` });
  }
}
