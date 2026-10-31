import { resolve } from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { normalizeText } from '../src/imports/normalization';
import { PrismaService } from '../src/platform/database/prisma.service';
config({ path: resolve(__dirname, '../../../.env') });
type MasterValue = {
  legacyCode?: string;
  state?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  kind?: string;
  branch?: string;
  deliveryMode?: string;
  programCode?: string;
  cohortCode?: string;
  subtotal?: number;
  discountAmount?: number;
  totalAmount?: number;
  paidAmount?: number;
  payments?: Array<{
    amount: number;
    method: string;
    receivedAt: string;
  }>;
};
type RawMaster = Record<string, Prisma.JsonValue>;
const present = (value: unknown): boolean =>
  value !== null && value !== undefined && `${value}`.trim() !== '';
const identityText = (value: unknown): string =>
  (normalizeText(value) ?? '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
class UnionFind {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }
  find(index: number): number {
    const parent = this.parent[index]!;
    if (parent === index) return index;
    this.parent[index] = this.find(parent);
    return this.parent[index]!;
  }
  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent[rightRoot] = leftRoot;
  }
}
function countPresent<T extends Record<string, unknown>>(rows: T[], field: keyof T): number {
  return rows.reduce((count, row) => count + (present(row[field]) ? 1 : 0), 0);
}
function duplicateSummary(groups: Map<string, number[]>) {
  const duplicates = [...groups.values()].map(({ length }) => length).filter((count) => count > 1);
  return {
    duplicateGroups: duplicates.length,
    rowsInDuplicateGroups: duplicates.reduce((sum, count) => sum + count, 0),
    excessRowsIfOneCanonical: duplicates.reduce((sum, count) => sum + count - 1, 0),
    largestGroup: Math.max(0, ...duplicates),
  };
}
async function main() {
  const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = application.get(PrismaService);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'PLG' } });
    const batch = await prisma.importBatch.findFirstOrThrow({
      where: { organizationId: organization.id },
      orderBy: { receivedAt: 'desc' },
      select: { id: true, sourceSha256: true, status: true },
    });
    const importedRows = await prisma.importRow.findMany({
      where: {
        organizationId: organization.id,
        sourceFileId: {
          in: (
            await prisma.importSourceFile.findMany({
              where: { organizationId: organization.id, batchId: batch.id },
              select: { id: true },
            })
          ).map(({ id }) => id),
        },
        sheetName: 'Master Sheet',
        disposition: 'IMPORTED',
        targetType: 'ENROLLMENT',
        targetId: { not: null },
      },
      orderBy: { rowNumber: 'asc' },
      select: {
        id: true,
        rowNumber: true,
        rawValues: true,
        normalizedValues: true,
        targetId: true,
      },
    });
    const rows = importedRows.map((row) => ({
      ...row,
      raw: row.rawValues as RawMaster,
      value: row.normalizedValues as unknown as MasterValue,
    }));
    const enrollmentIds = rows.flatMap(({ targetId }) => (targetId ? [targetId] : []));
    const enrollments = await prisma.enrollment.findMany({
      where: { organizationId: organization.id, id: { in: enrollmentIds } },
      select: {
        id: true,
        studentPersonId: true,
        programVersionId: true,
        homeBranchId: true,
        billingAccountId: true,
        state: true,
      },
    });
    const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
    const importedPersonIds = [
      ...new Set(enrollments.map(({ studentPersonId }) => studentPersonId)),
    ];
    const contacts = await prisma.personContact.findMany({
      where: { organizationId: organization.id, personId: { in: importedPersonIds } },
      select: { personId: true, type: true, normalizedValue: true },
    });
    const contactPeople = new Map<string, Set<string>>();
    for (const contact of contacts) {
      const set = contactPeople.get(contact.personId) ?? new Set<string>();
      set.add(contact.type);
      contactPeople.set(contact.personId, set);
    }
    const assignments = await prisma.enrollmentCohortAssignment.findMany({
      where: { organizationId: organization.id, enrollmentId: { in: enrollmentIds } },
      select: { enrollmentId: true, cohortId: true, endsAt: true },
    });
    const currentAssignmentEnrollments = new Set(
      assignments.filter(({ endsAt }) => endsAt === null).map(({ enrollmentId }) => enrollmentId),
    );
    const agreements = await prisma.pricingAgreement.findMany({
      where: { organizationId: organization.id, enrollmentId: { in: enrollmentIds } },
      select: { enrollmentId: true, status: true },
    });
    const agreementEnrollments = new Set(agreements.map(({ enrollmentId }) => enrollmentId));
    const payments = await prisma.payment.findMany({
      where: { organizationId: organization.id, enrollmentId: { in: enrollmentIds } },
      select: { enrollmentId: true },
    });
    const paymentEnrollments = new Set(
      payments.flatMap(({ enrollmentId }) => (enrollmentId ? [enrollmentId] : [])),
    );
    const attendance = await prisma.attendanceRecord.groupBy({
      by: ['enrollmentId'],
      where: { organizationId: organization.id, enrollmentId: { in: enrollmentIds } },
      _count: { _all: true },
    });
    const attendanceEnrollments = new Set(attendance.map(({ enrollmentId }) => enrollmentId));
    const certificates = await prisma.certificate.findMany({
      where: { organizationId: organization.id, enrollmentId: { in: enrollmentIds } },
      select: { enrollmentId: true },
    });
    const certificateEnrollments = new Set(certificates.map(({ enrollmentId }) => enrollmentId));
    const identities = rows.map(({ value }) => ({
      phone: identityText(value.phone),
      email: identityText(value.email),
      name: identityText(value.name),
    }));
    const union = new UnionFind(identities.length);
    const indexesByValue = (field: keyof (typeof identities)[number]) => {
      const result = new Map<string, number[]>();
      identities.forEach((identity, index) => {
        const value = identity[field];
        if (!value) return;
        const indexes = result.get(value) ?? [];
        indexes.push(index);
        result.set(value, indexes);
      });
      return result;
    };
    const phoneGroups = indexesByValue('phone');
    const emailGroups = indexesByValue('email');
    const nameGroups = indexesByValue('name');
    const sameName = (left: (typeof identities)[number], right: (typeof identities)[number]) =>
      Boolean(left.name && left.name === right.name);
    for (let left = 0; left < identities.length; left += 1) {
      for (let right = left + 1; right < identities.length; right += 1) {
        const a = identities[left]!;
        const b = identities[right]!;
        const samePhone = Boolean(a.phone && a.phone === b.phone);
        const sameEmail = Boolean(a.email && a.email === b.email);
        const strongMatch =
          (samePhone && sameEmail) ||
          (samePhone && sameName(a, b)) ||
          (sameEmail && sameName(a, b));
        if (strongMatch) union.union(left, right);
      }
    }
    const strongClusters = new Map<number, number>();
    identities.forEach((_, index) => {
      const root = union.find(index);
      strongClusters.set(root, (strongClusters.get(root) ?? 0) + 1);
    });
    const duplicatedStrongClusters = [...strongClusters.values()].filter((count) => count > 1);
    const importedReferences = await prisma.legacyReference.findMany({
      where: {
        organizationId: organization.id,
        importRowId: { in: rows.map(({ id }) => id) },
        entityType: 'ENROLLMENT',
      },
      select: { importRowId: true, sourceField: true },
    });
    const referenceFields = new Map<string, Set<string>>();
    for (const reference of importedReferences) {
      const fields = referenceFields.get(reference.importRowId) ?? new Set<string>();
      fields.add(reference.sourceField);
      referenceFields.set(reference.importRowId, fields);
    }
    const totalStudentProfiles = await prisma.studentProfile.count({
      where: { organizationId: organization.id },
    });
    const allEnrollmentPeople = new Set(
      (
        await prisma.enrollment.findMany({
          where: { organizationId: organization.id },
          select: { studentPersonId: true },
        })
      ).map(({ studentPersonId }) => studentPersonId),
    );
    const allStudentPeople = new Set(
      (
        await prisma.studentProfile.findMany({
          where: { organizationId: organization.id },
          select: { personId: true },
        })
      ).map(({ personId }) => personId),
    );
    const importedPeople = new Set(importedPersonIds);
    const rawFieldCoverage = Object.fromEntries(
      [
        ['A', 'legacyCode'],
        ['B', 'state'],
        ['C', 'telesalesAgent'],
        ['D', 'name'],
        ['F', 'phone'],
        ['G', 'email'],
        ['H', 'source'],
        ['I', 'customerType'],
        ['J', 'secondaryCode'],
        ['K', 'location'],
        ['L', 'deliveryMode'],
        ['M', 'program'],
        ['N', 'cohort'],
        ['O', 'originalPrice'],
        ['P', 'discount'],
        ['Q', 'totalAmount'],
        ['R', 'shouldPaid'],
        ['S', 'remaining'],
        ['T', 'paid'],
      ].map(([column, label]) => [label, rows.filter(({ raw }) => present(raw[column!])).length]),
    );
    const normalized = rows.map(({ value }) => value as Record<string, unknown>);
    const output = {
      batch,
      rowCounts: {
        importedMasterRows: rows.length,
        importedEnrollmentsFound: enrollments.length,
        importedDistinctPeople: importedPersonIds.length,
        totalStudentProfiles,
        nonImportedStudentProfiles: totalStudentProfiles - importedPeople.size,
        nonImportedEnrollmentPeople: [...allEnrollmentPeople].filter(
          (id) => !importedPeople.has(id),
        ).length,
        studentProfilesWithoutAnyEnrollment: [...allStudentPeople].filter(
          (id) => !allEnrollmentPeople.has(id),
        ).length,
      },
      sourceCoverage: rawFieldCoverage,
      normalizedCoverage: {
        legacyCode: countPresent(normalized, 'legacyCode'),
        name: countPresent(normalized, 'name'),
        phone: countPresent(normalized, 'phone'),
        email: countPresent(normalized, 'email'),
        programCode: countPresent(normalized, 'programCode'),
        cohortCode: countPresent(normalized, 'cohortCode'),
        branch: countPresent(normalized, 'branch'),
        deliveryMode: countPresent(normalized, 'deliveryMode'),
        pricingTotalAboveZero: rows.filter(({ value }) => Number(value.totalAmount ?? 0) > 0)
          .length,
        paymentRows: rows.filter(({ value }) => (value.payments?.length ?? 0) > 0).length,
      },
      qualitySignals: {
        formulaErrorNames: rows.filter(({ value }) =>
          /^#(NAME|VALUE|REF|N\/A|DIV\/0)/i.test(value.name ?? ''),
        ).length,
        nonCanonicalPhones: rows.filter(({ value }) => !/^\+20\d{10}$/.test(value.phone ?? ''))
          .length,
        invalidEmails: rows.filter(
          ({ value }) => value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email),
        ).length,
        workbookRemainingMismatches: rows.filter(({ raw }) => {
          const total = Number(raw.Q);
          const paid = Number(raw.T);
          const remaining = Number(raw.S);
          return (
            [total, paid, remaining].every(Number.isFinite) &&
            Math.abs(total - paid - remaining) > 1
          );
        }).length,
      },
      ignoredButPopulatedSourceFields: {
        telesalesAgent: rawFieldCoverage.telesalesAgent,
        source: rawFieldCoverage.source,
        secondaryCode: rawFieldCoverage.secondaryCode,
        shouldPaid: rawFieldCoverage.shouldPaid,
        remaining: rawFieldCoverage.remaining,
      },
      identityDuplication: {
        exactPhone: duplicateSummary(phoneGroups),
        exactEmail: duplicateSummary(emailGroups),
        exactName: duplicateSummary(nameGroups),
        strongTwoFactorClusters: duplicatedStrongClusters.length,
        rowsInStrongTwoFactorClusters: duplicatedStrongClusters.reduce(
          (sum, count) => sum + count,
          0,
        ),
        excessRowsIfStrongClustersMerged: duplicatedStrongClusters.reduce(
          (sum, count) => sum + count - 1,
          0,
        ),
        largestStrongCluster: Math.max(0, ...duplicatedStrongClusters),
      },
      targetCoverage: {
        peopleWithPhone: [...contactPeople.values()].filter((types) => types.has('PHONE')).length,
        peopleWithEmail: [...contactPeople.values()].filter((types) => types.has('EMAIL')).length,
        enrollmentsWithCurrentCohort: currentAssignmentEnrollments.size,
        enrollmentsWithPricingAgreement: agreementEnrollments.size,
        enrollmentsWithPayments: paymentEnrollments.size,
        enrollmentsWithAttendance: attendanceEnrollments.size,
        enrollmentsWithCertificate: certificateEnrollments.size,
        referencesComplete: rows.filter(({ id }) => {
          const fields = referenceFields.get(id);
          return [
            'MASTER_ROW',
            'ENROLLMENT_BRANCH',
            'ENROLLMENT_DELIVERY_MODE',
            'MASTER_ENROLLMENT_KEY',
          ].every((field) => fields?.has(field));
        }).length,
        enrollmentsWithCoreForeignKeys: enrollments.filter(
          ({ studentPersonId, programVersionId, homeBranchId, billingAccountId }) =>
            Boolean(studentPersonId && programVersionId && homeBranchId && billingAccountId),
        ).length,
      },
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await application.close();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
