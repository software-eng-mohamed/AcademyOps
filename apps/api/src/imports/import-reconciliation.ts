import type { Prisma } from '@prisma/client';
import {
  asObject,
  type AttendanceRowValue,
  type CalendarValue,
  type MasterValue,
} from './import-values';
import { reconcileImportFinance } from './import-finance-reconciliation';

type Db = Prisma.TransactionClient;
export type ImportMetricDimension = {
  importRowId?: string;
  sheetName?: string;
  rowNumber?: number | null;
  rowHash?: string;
  enrollmentId?: string | null;
  approvedAgreementCount?: number;
  chargeCount?: number;
  paymentReferenceCount?: number;
  problems?: string[];
};

export type ImportMetric = {
  metric: string;
  sourceValue: number;
  targetValue: number;
  difference: number;
  passed: boolean;
  dimension?: ImportMetricDimension;
};

export async function calculateImportMetrics(
  db: Db,
  organizationId: string,
  batchId: string,
): Promise<ImportMetric[]> {
  const sourceIds = (
    await db.importSourceFile.findMany({ where: { organizationId, batchId }, select: { id: true } })
  ).map((source) => source.id);
  const rows = await db.importRow.findMany({
    where: {
      organizationId,
      sourceFileId: { in: sourceIds },
      disposition: { in: ['READY', 'IMPORTED'] },
    },
    select: {
      id: true,
      rowHash: true,
      rowNumber: true,
      sheetName: true,
      normalizedValues: true,
    },
  });
  const masterRows = rows.filter((row) => row.sheetName === 'Master Sheet');
  const attendanceRows = rows.filter((row) => row.sheetName === 'Attendance & Cert.');
  const calendarRows = rows.filter((row) => row.sheetName.startsWith('Annual Calendar'));
  const expected = {
    MASTER_ROW: masterRows.length,
    CALENDAR_ROW: calendarRows.length,
    CALENDAR_WALL_CLOCK_ROW: calendarRows.length,
    ATTENDANCE_MARK: attendanceRows.reduce(
      (sum, row) => sum + asObject<AttendanceRowValue>(row.normalizedValues).attendance.length,
      0,
    ),
    ATTENDANCE_RATIO_ROW: attendanceRows.length,
    PAYMENT: masterRows.reduce(
      (sum, row) => sum + asObject<MasterValue>(row.normalizedValues).payments.length,
      0,
    ),
    CERTIFICATE_STATUS_EVIDENCE: attendanceRows.filter(
      (row) => asObject<AttendanceRowValue>(row.normalizedValues).certificateStatus,
    ).length,
    CALENDAR_COORDINATOR_EVIDENCE: calendarRows.filter(
      (row) => asObject<CalendarValue>(row.normalizedValues).coordinatorName,
    ).length,
    ENROLLMENT_BRANCH: masterRows.length,
    ENROLLMENT_DELIVERY_MODE: masterRows.length,
  };
  const rowIds = rows.map((row) => row.id);
  const actual = await Promise.all([
    countTargets(db, organizationId, rowIds, 'MASTER_ROW', 'ENROLLMENT'),
    countTargets(db, organizationId, rowIds, 'CALENDAR_ROW', 'SESSION'),
    matchingCalendarWallRows(db, organizationId, calendarRows),
    countTargets(db, organizationId, rowIds, 'ATTENDANCE_MARK', 'ATTENDANCE'),
    matchingRatioRows(db, organizationId, attendanceRows),
    countValidPaymentTargets(db, organizationId, rowIds),
    countReferences(db, organizationId, rowIds, 'CERTIFICATE_STATUS', 'CERTIFICATE_HISTORY'),
    countReferences(db, organizationId, rowIds, 'SESSION_COORDINATOR', 'SESSION'),
    countTargets(db, organizationId, rowIds, 'ENROLLMENT_BRANCH', 'ENROLLMENT'),
    countTargets(db, organizationId, rowIds, 'ENROLLMENT_DELIVERY_MODE', 'ENROLLMENT'),
  ]);
  const domain = (Object.entries(expected) as Array<[keyof typeof expected, number]>).map(
    ([key, sourceValue], index) => ({
      metric: `domain.${key.toLowerCase()}`,
      sourceValue,
      targetValue: actual[index]!,
      difference: actual[index]! - sourceValue,
      passed: actual[index] === sourceValue,
    }),
  );
  const [imported, quarantined, issues] = await Promise.all([
    db.importRow.count({
      where: { organizationId, sourceFileId: { in: sourceIds }, disposition: 'IMPORTED' },
    }),
    db.importRow.count({
      where: { organizationId, sourceFileId: { in: sourceIds }, disposition: 'QUARANTINED' },
    }),
    db.importIssue.count({ where: { organizationId, batchId, status: 'OPEN' } }),
  ]);
  const finance = await reconcileImportFinance(db, organizationId, masterRows);
  return [
    ...domain,
    ...finance,
    metric('progress.imported_rows', rows.length, imported),
    metric('progress.quarantined_rows', quarantined, 0),
    metric('progress.open_issues', issues, 0),
  ];
}

export async function saveImportMetrics(
  db: Db,
  organizationId: string,
  batchId: string,
  metrics: ImportMetric[],
): Promise<void> {
  await db.importReconciliation.deleteMany({ where: { organizationId, batchId } });
  await db.importReconciliation.createMany({
    data: metrics.map((entry) => ({ organizationId, batchId, ...entry })),
  });
}

async function matchingRatioRows(
  db: Db,
  organizationId: string,
  rows: Array<{ id: string; normalizedValues: Prisma.JsonValue | null }>,
): Promise<number> {
  if (!rows.length) return 0;
  const references = await db.legacyReference.findMany({
    where: {
      organizationId,
      importRowId: { in: rows.map((row) => row.id) },
      entityType: 'ATTENDANCE',
      sourceField: 'ATTENDANCE_MARK',
    },
    select: { importRowId: true, entityId: true },
  });
  const records = await db.attendanceRecord.findMany({
    where: { organizationId, id: { in: references.map((reference) => reference.entityId) } },
    select: { id: true, currentStatus: true },
  });
  const statuses = new Map(records.map((record) => [record.id, record.currentStatus]));
  return rows.filter((row) => {
    const value = asObject<AttendanceRowValue>(row.normalizedValues);
    const refs = references.filter((reference) => reference.importRowId === row.id);
    if (!value.applicableSessionCount || refs.length !== value.applicableSessionCount) return false;
    const attended = refs.filter((reference) => {
      const status = statuses.get(reference.entityId);
      return status === 'PRESENT' || status === 'LATE';
    }).length;
    return Math.abs(attended / refs.length - value.attendanceRatio) <= 0.005;
  }).length;
}

async function matchingCalendarWallRows(
  db: Db,
  organizationId: string,
  rows: Array<{ id: string; normalizedValues: Prisma.JsonValue | null }>,
): Promise<number> {
  if (!rows.length) return 0;
  const references = await db.legacyReference.findMany({
    where: {
      organizationId,
      importRowId: { in: rows.map((row) => row.id) },
      entityType: 'SESSION',
      sourceField: 'CALENDAR_ROW',
    },
    select: { importRowId: true, entityId: true },
  });
  const sessions = await db.session.findMany({
    where: { organizationId, id: { in: references.map((reference) => reference.entityId) } },
    select: { id: true, startsAt: true, endsAt: true },
  });
  const byId = new Map(sessions.map((session) => [session.id, session]));
  return rows.filter((row) => {
    const value = asObject<CalendarValue>(row.normalizedValues);
    const reference = references.find((entry) => entry.importRowId === row.id);
    const session = reference ? byId.get(reference.entityId) : undefined;
    return (
      formatCairo(session?.startsAt) === value.sourceWallStart &&
      formatCairo(session?.endsAt) === value.sourceWallEnd
    );
  }).length;
}

function formatCairo(value: Date | null | undefined): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}

async function countTargets(
  db: Db,
  organizationId: string,
  rowIds: string[],
  sourceField: string,
  entityType: string,
): Promise<number> {
  if (!rowIds.length) return 0;
  const references = await db.legacyReference.findMany({
    where: { organizationId, importRowId: { in: rowIds }, sourceField, entityType },
    select: { entityId: true },
  });
  const ids = [...new Set(references.map((reference) => reference.entityId))];
  if (!ids.length) return 0;
  if (entityType === 'SESSION')
    return db.session.count({ where: { organizationId, id: { in: ids } } });
  if (entityType === 'ATTENDANCE')
    return db.attendanceRecord.count({ where: { organizationId, id: { in: ids } } });
  if (entityType === 'PAYMENT')
    return db.payment.count({ where: { organizationId, id: { in: ids } } });
  return db.enrollment.count({ where: { organizationId, id: { in: ids } } });
}

async function countValidPaymentTargets(
  db: Db,
  organizationId: string,
  rowIds: string[],
): Promise<number> {
  if (!rowIds.length) return 0;
  const references = await db.legacyReference.findMany({
    where: {
      organizationId,
      importRowId: { in: rowIds },
      sourceField: 'PAYMENT',
      entityType: 'PAYMENT',
    },
    select: { entityId: true },
  });
  const ids = [...new Set(references.map((reference) => reference.entityId))];
  if (!ids.length) return 0;
  const unknownMethod = await db.paymentMethod.findUnique({
    where: { organizationId_code: { organizationId, code: 'LEGACY_UNKNOWN' } },
    select: { id: true },
  });
  return db.payment.count({
    where: {
      organizationId,
      id: { in: ids },
      status: 'POSTED',
      ...(unknownMethod ? { methodId: { not: unknownMethod.id } } : {}),
    },
  });
}

async function countReferences(
  db: Db,
  organizationId: string,
  rowIds: string[],
  sourceField: string,
  entityType: string,
): Promise<number> {
  if (!rowIds.length) return 0;
  return db.legacyReference.count({
    where: { organizationId, importRowId: { in: rowIds }, sourceField, entityType },
  });
}

const metric = (name: string, sourceValue: number, targetValue: number): ImportMetric => ({
  metric: name,
  sourceValue,
  targetValue,
  difference: targetValue - sourceValue,
  passed: targetValue === sourceValue,
});
