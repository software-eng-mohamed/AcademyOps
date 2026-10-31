import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../src/platform/database/prisma.service';
config({ path: resolve(__dirname, '../../../.env') });
const [outputPath, requestedSha256] = process.argv.slice(2);
if (!outputPath) {
  throw new Error('Usage: ts-node audit-real-academy-import.ts <output.json> [source-sha256]');
}
const prisma = new PrismaService();
const objectValue = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const scalarValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const object = value as Record<string, unknown>;
  return 'formula' in object ? scalarValue(object.value) : value;
};
const textValue = (value: unknown): string | null => {
  value = scalarValue(value);
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).trim();
  return result || null;
};
const numericValue = (value: unknown): number | null => {
  value = scalarValue(value);
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}
async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'PLG' } });
  const source = await prisma.importSourceFile.findFirst({
    where: {
      organizationId: organization.id,
      ...(requestedSha256 ? { sha256: requestedSha256 } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!source) throw new Error('No matching legacy academy import source was found.');
  const batch = await prisma.importBatch.findFirstOrThrow({
    where: { organizationId: organization.id, id: source.batchId },
  });
  const sources = await prisma.importSourceFile.findMany({
    where: { organizationId: organization.id, batchId: batch.id },
    orderBy: { createdAt: 'asc' },
  });
  const sourceIds = sources.map(({ id }) => id);
  const [rows, issues, references, reconciliations] = await Promise.all([
    prisma.importRow.findMany({
      where: { organizationId: organization.id, sourceFileId: { in: sourceIds } },
      orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
      select: {
        id: true,
        sheetName: true,
        rowNumber: true,
        rowHash: true,
        disposition: true,
        rawValues: true,
        normalizedValues: true,
        targetType: true,
        targetId: true,
      },
    }),
    prisma.importIssue.findMany({
      where: { organizationId: organization.id, batchId: batch.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        importRowId: true,
        code: true,
        severity: true,
        status: true,
        details: true,
      },
    }),
    prisma.legacyReference.findMany({
      where: { organizationId: organization.id },
      select: {
        importRowId: true,
        entityType: true,
        entityId: true,
        sourceField: true,
        rawValue: true,
      },
    }),
    prisma.importReconciliation.findMany({
      where: { organizationId: organization.id, batchId: batch.id },
      orderBy: { metric: 'asc' },
    }),
  ]);
  const rowIds = new Set(rows.map(({ id }) => id));
  const batchReferences = references.filter(
    ({ importRowId }) => importRowId && rowIds.has(importRowId),
  );
  const issuesByRow = new Map<string, typeof issues>();
  for (const issue of issues) {
    if (!issue.importRowId) continue;
    const current = issuesByRow.get(issue.importRowId) ?? [];
    current.push(issue);
    issuesByRow.set(issue.importRowId, current);
  }
  const referencesByRow = new Map<string, typeof batchReferences>();
  for (const reference of batchReferences) {
    if (!reference.importRowId) continue;
    const current = referencesByRow.get(reference.importRowId) ?? [];
    current.push(reference);
    referencesByRow.set(reference.importRowId, current);
  }
  const enrollmentIds = [
    ...new Set(
      batchReferences
        .filter(
          ({ entityType, sourceField }) =>
            entityType === 'ENROLLMENT' && sourceField === 'MASTER_ROW',
        )
        .map(({ entityId }) => entityId),
    ),
  ];
  const sessionIds = [
    ...new Set(
      batchReferences
        .filter(
          ({ entityType, sourceField }) =>
            entityType === 'SESSION' && sourceField === 'CALENDAR_ROW',
        )
        .map(({ entityId }) => entityId),
    ),
  ];
  const attendanceIds = [
    ...new Set(
      batchReferences
        .filter(
          ({ entityType, sourceField }) =>
            entityType === 'ATTENDANCE' && sourceField === 'ATTENDANCE_MARK',
        )
        .map(({ entityId }) => entityId),
    ),
  ];
  const paymentIds = [
    ...new Set(
      batchReferences
        .filter(
          ({ entityType, sourceField }) => entityType === 'PAYMENT' && sourceField === 'PAYMENT',
        )
        .map(({ entityId }) => entityId),
    ),
  ];
  const enrollments = await prisma.enrollment.findMany({
    where: { organizationId: organization.id, id: { in: enrollmentIds } },
  });
  const [sessions, attendanceRecords, payments, agreements, contacts, allProfiles] =
    await Promise.all([
      prisma.session.findMany({
        where: { organizationId: organization.id, id: { in: sessionIds } },
      }),
      prisma.attendanceRecord.findMany({
        where: { organizationId: organization.id, id: { in: attendanceIds } },
      }),
      prisma.payment.findMany({
        where: { organizationId: organization.id, id: { in: paymentIds } },
      }),
      prisma.pricingAgreement.findMany({
        where: {
          organizationId: organization.id,
          enrollmentId: { in: enrollmentIds },
          status: 'APPROVED',
        },
      }),
      prisma.personContact.findMany({
        where: {
          organizationId: organization.id,
          personId: { in: enrollments.map(({ studentPersonId }) => studentPersonId) },
        },
      }),
      prisma.studentProfile.findMany({ where: { organizationId: organization.id } }),
    ]);
  const methods = await prisma.paymentMethod.findMany({
    where: {
      organizationId: organization.id,
      id: { in: payments.map(({ methodId }) => methodId) },
    },
  });
  const methodById = new Map(methods.map((method) => [method.id, method]));
  const importedPersonIds = new Set(enrollments.map(({ studentPersonId }) => studentPersonId));
  const profilePersonIds = new Set(allProfiles.map(({ personId }) => personId));
  const systemOnlyPersonIds = allProfiles
    .filter(({ personId }) => !importedPersonIds.has(personId))
    .map(({ personId }) => personId);
  const [systemOnlyPeople, systemOnlyEnrollments, systemOnlyUsers] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId: organization.id, id: { in: systemOnlyPersonIds } },
      select: { id: true, publicId: true, name: true, createdAt: true },
    }),
    prisma.enrollment.findMany({
      where: { organizationId: organization.id, studentPersonId: { in: systemOnlyPersonIds } },
      select: { id: true, studentPersonId: true, state: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { organizationId: organization.id, personId: { in: systemOnlyPersonIds } },
      select: { id: true, personId: true, status: true, createdAt: true },
    }),
  ]);
  const [
    totalEnrollments,
    totalSessions,
    totalAttendanceRecords,
    totalPostedPayments,
    totalCertificates,
    reversedRepairPayments,
  ] = await Promise.all([
    prisma.enrollment.count({ where: { organizationId: organization.id } }),
    prisma.session.count({ where: { organizationId: organization.id } }),
    prisma.attendanceRecord.count({ where: { organizationId: organization.id } }),
    prisma.payment.count({ where: { organizationId: organization.id, status: 'POSTED' } }),
    prisma.certificate.count({ where: { organizationId: organization.id } }),
    prisma.payment.count({
      where: {
        organizationId: organization.id,
        status: 'REVERSED',
        idempotencyKey: { startsWith: 'legacy-payment-repair:' },
      },
    }),
  ]);
  const calendarSessionIds = new Set(sessions.map(({ id }) => id));
  const attendanceDerivedSessionIds = new Set(
    attendanceRecords.map(({ sessionId }) => sessionId).filter((id) => !calendarSessionIds.has(id)),
  );
  const masterRows = rows.filter(({ sheetName }) => sheetName === 'Master Sheet');
  const ignoredMasterCoverage = Object.fromEntries(
    [
      ['telesalesAgent', 'C'],
      ['acquisitionSource', 'H'],
      ['secondaryCode', 'J'],
      ['workbookShouldPaid', 'R'],
      ['workbookRemaining', 'S'],
    ].map(([field, column]) => [
      `${column}.${field}`,
      masterRows.filter((row) => textValue(objectValue(row.rawValues)[column]) !== null).length,
    ]),
  );
  const paymentMethodSummary = Object.values(
    payments.reduce<
      Record<
        string,
        {
          code: string;
          name: string;
          count: number;
          amount: number;
        }
      >
    >((summary, payment) => {
      const method = methodById.get(payment.methodId);
      const code = method?.code ?? payment.methodId;
      const current = summary[code] ?? {
        code,
        name: method?.name ?? 'Unknown',
        count: 0,
        amount: 0,
      };
      current.count += 1;
      current.amount = Math.round((current.amount + Number(payment.amount)) * 100) / 100;
      summary[code] = current;
      return summary;
    }, {}),
  ).sort((left, right) => right.amount - left.amount);
  const totalPaymentAmount = paymentMethodSummary.reduce((sum, method) => sum + method.amount, 0);
  const contactPeopleByKey = new Map<string, Set<string>>();
  for (const contact of contacts) {
    const normalized = (contact.normalizedValue ?? contact.rawValue).trim().toLowerCase();
    if (!normalized) continue;
    const key = `${contact.type}|${normalized}`;
    const people = contactPeopleByKey.get(key) ?? new Set<string>();
    people.add(contact.personId);
    contactPeopleByKey.set(key, people);
  }
  const sharedFactorsByPair = new Map<string, Set<string>>();
  for (const [factor, people] of contactPeopleByKey) {
    const ids = [...people].sort();
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const key = `${ids[left]}|${ids[right]}`;
        const factors = sharedFactorsByPair.get(key) ?? new Set<string>();
        factors.add(factor.split('|', 1)[0]!);
        sharedFactorsByPair.set(key, factors);
      }
    }
  }
  const strongPairs = [...sharedFactorsByPair]
    .filter(([, factors]) => factors.size >= 2)
    .map(([pair, factors]) => ({ personIds: pair.split('|'), factors: [...factors].sort() }));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const { personIds } of strongPairs) {
    const [left, right] = personIds;
    if (left && right) union(left, right);
  }
  const strongComponentsByRoot = new Map<string, Set<string>>();
  for (const { personIds } of strongPairs) {
    for (const id of personIds) {
      const root = find(id);
      const component = strongComponentsByRoot.get(root) ?? new Set<string>();
      component.add(id);
      strongComponentsByRoot.set(root, component);
    }
  }
  const strongComponents = [...strongComponentsByRoot.values()].map((people) => [...people].sort());
  const paymentEvidenceByKey = new Map<
    string,
    {
      importRowId: string;
      rowNumber: number | null;
      ordinal: number;
      amount: number;
      method: string;
      receivedAt: string;
      codes: string[];
    }
  >();
  for (const issue of issues.filter(
    ({ status, code }) =>
      status === 'OPEN' && (code === 'PAYMENT_DATE_REQUIRED' || code === 'PAYMENT_METHOD_REQUIRED'),
  )) {
    if (!issue.importRowId) continue;
    const details = objectValue(issue.details);
    const evidence = Array.isArray(details.paymentEvidenceIssues)
      ? details.paymentEvidenceIssues
      : [];
    for (const rawEntry of evidence) {
      const entry =
        rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
          ? (rawEntry as Record<string, unknown>)
          : {};
      const ordinal = numericValue(entry.ordinal);
      const amount = numericValue(entry.amount);
      const codes = Array.isArray(entry.codes)
        ? entry.codes.filter((value): value is string => typeof value === 'string')
        : [];
      if (!ordinal || amount === null || !codes.length) continue;
      paymentEvidenceByKey.set(`${issue.importRowId}|${ordinal}`, {
        importRowId: issue.importRowId,
        rowNumber: rows.find(({ id }) => id === issue.importRowId)?.rowNumber ?? null,
        ordinal,
        amount,
        method: textValue(entry.method) ?? '',
        receivedAt: textValue(entry.receivedAt) ?? '',
        codes,
      });
    }
  }
  const paymentEvidence = [...paymentEvidenceByKey.values()];
  const rowAudit = rows.map((row) => {
    const normalized = objectValue(row.normalizedValues);
    const rowIssues = issuesByRow.get(row.id) ?? [];
    const rowReferences = referencesByRow.get(row.id) ?? [];
    return {
      sheet: row.sheetName,
      row: row.rowNumber,
      rowHash: row.rowHash,
      disposition: row.disposition,
      identity:
        row.sheetName === 'Master Sheet'
          ? {
              legacyCode: textValue(normalized.legacyCode),
              name: textValue(normalized.name),
              cohortCode: textValue(normalized.cohortCode),
            }
          : row.sheetName === 'Attendance & Cert.'
            ? {
                name: textValue(normalized.name),
                cohortCode: textValue(normalized.cohortCode),
              }
            : {
                cohortCode: textValue(normalized.cohortCode),
                sessionOrdinal: numericValue(normalized.sessionOrdinal),
                moduleName: textValue(normalized.moduleName),
              },
      openIssues: rowIssues.filter(({ status }) => status === 'OPEN').map(({ code }) => code),
      resolvedIssues: rowIssues.filter(({ status }) => status !== 'OPEN').map(({ code }) => code),
      target: row.targetId ? { type: row.targetType, id: row.targetId } : null,
      references: rowReferences.map(({ entityType, entityId, sourceField, rawValue }) => ({
        entityType,
        entityId,
        sourceField,
        rawValue,
      })),
    };
  });
  const result = {
    generatedAt: new Date().toISOString(),
    organization: { id: organization.id, code: organization.code },
    batch: {
      id: batch.id,
      status: batch.status,
      sourceSha256: source.sha256,
      sourceName: source.originalName,
      sourceCount: sources.length,
    },
    summary: {
      rowsBySheetAndDisposition: countBy(rows, (row) => `${row.sheetName}|${row.disposition}`),
      issuesByStatusAndCode: countBy(issues, (issue) => `${issue.status}|${issue.code}`),
      openIssuesBySheetAndCode: countBy(
        issues.filter(({ status }) => status === 'OPEN'),
        (issue) => {
          const row = rows.find(({ id }) => id === issue.importRowId);
          return `${row?.sheetName ?? 'BATCH'}|${issue.code}`;
        },
      ),
      referencesByEntityAndField: countBy(
        batchReferences,
        (reference) => `${reference.entityType}|${reference.sourceField}`,
      ),
      targetIntegrity: {
        enrollmentReferences: enrollmentIds.length,
        enrollmentsFound: enrollments.length,
        sessionReferences: sessionIds.length,
        sessionsFound: sessions.length,
        attendanceReferences: attendanceIds.length,
        attendanceRecordsFound: attendanceRecords.length,
        paymentReferences: paymentIds.length,
        paymentsFound: payments.length,
        approvedPricingAgreements: agreements.length,
      },
      systemOnlyDomainRows: {
        enrollments: Math.max(0, totalEnrollments - enrollments.length),
        sessions: Math.max(0, totalSessions - sessions.length - attendanceDerivedSessionIds.size),
        attendanceDerivedPlaceholderSessions: attendanceDerivedSessionIds.size,
        attendanceRecords: Math.max(0, totalAttendanceRecords - attendanceRecords.length),
        payments: Math.max(0, totalPostedPayments - payments.length),
        certificates: totalCertificates,
      },
      studentPopulation: {
        importedDistinctPeople: importedPersonIds.size,
        totalStudentProfiles: allProfiles.length,
        systemOnlyProfiles: allProfiles.filter(({ personId }) => !importedPersonIds.has(personId))
          .length,
        importedPeopleMissingProfile: [...importedPersonIds].filter(
          (id) => !profilePersonIds.has(id),
        ).length,
        importedPeopleWithPhone: new Set(
          contacts.filter(({ type }) => type === 'PHONE').map(({ personId }) => personId),
        ).size,
        importedPeopleWithEmail: new Set(
          contacts.filter(({ type }) => type === 'EMAIL').map(({ personId }) => personId),
        ).size,
        systemOnlyProfileDetails: systemOnlyPeople.map((person) => ({
          ...person,
          enrollments: systemOnlyEnrollments
            .filter(({ studentPersonId }) => studentPersonId === person.id)
            .map(({ id, state, createdAt }) => ({ id, state, createdAt })),
          users: systemOnlyUsers
            .filter(({ personId }) => personId === person.id)
            .map(({ id, status, createdAt }) => ({ id, status, createdAt })),
        })),
      },
      possibleDuplicateStudents: {
        rule: 'Two distinct imported people share both normalized phone and normalized email',
        strongPairCount: strongPairs.length,
        componentCount: strongComponents.length,
        affectedPeople: new Set(strongComponents.flat()).size,
        potentialExcessProfiles: strongComponents.reduce(
          (sum, component) => sum + Math.max(0, component.length - 1),
          0,
        ),
        components: strongComponents,
      },
      sourceFieldsStoredOnlyInImportEvidence: ignoredMasterCoverage,
      paymentMethods: paymentMethodSummary.map((method) => ({
        ...method,
        percentOfImportedAmount: totalPaymentAmount
          ? Math.round((method.amount / totalPaymentAmount) * 10000) / 100
          : 0,
      })),
      importedPaymentQuality: {
        postedPayments: payments.length,
        verifiedPayments: payments.filter(
          ({ methodId }) => methodById.get(methodId)?.code !== 'LEGACY_UNKNOWN',
        ).length,
        paymentsAwaitingMethodReview: payments.filter(
          ({ methodId }) => methodById.get(methodId)?.code === 'LEGACY_UNKNOWN',
        ).length,
        reversedDuplicateRepairPayments: reversedRepairPayments,
      },
      paymentEvidence: {
        affectedRows: new Set(paymentEvidence.map(({ importRowId }) => importRowId)).size,
        affectedEntries: paymentEvidence.length,
        missingDateEntries: paymentEvidence.filter(({ codes }) =>
          codes.includes('PAYMENT_DATE_REQUIRED'),
        ).length,
        missingDateAmount: paymentEvidence
          .filter(({ codes }) => codes.includes('PAYMENT_DATE_REQUIRED'))
          .reduce((sum, { amount }) => Math.round((sum + amount) * 100) / 100, 0),
        missingMethodEntries: paymentEvidence.filter(({ codes }) =>
          codes.includes('PAYMENT_METHOD_REQUIRED'),
        ).length,
        missingMethodAmount: paymentEvidence
          .filter(({ codes }) => codes.includes('PAYMENT_METHOD_REQUIRED'))
          .reduce((sum, { amount }) => Math.round((sum + amount) * 100) / 100, 0),
        entries: paymentEvidence,
      },
      reconciliation: reconciliations,
    },
    rows: rowAudit,
  };
  await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify({ outputPath: resolve(outputPath), ...result.batch, ...result.summary }, null, 2)}\n`,
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
