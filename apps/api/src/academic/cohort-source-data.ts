export function normalizeCohortSourceCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export type CohortScheduleState =
  | 'NO_SOURCE_SCHEDULE'
  | 'NEEDS_REVIEW'
  | 'UPCOMING'
  | 'IN_PROGRESS'
  | 'ENDED';

export function deriveCohortScheduleState(
  firstStartsAt: Date | null,
  lastEndsAt: Date | null,
  conflictCount: number,
  now = new Date(),
): CohortScheduleState {
  if (!firstStartsAt || !lastEndsAt) return 'NO_SOURCE_SCHEDULE';
  if (conflictCount > 0) return 'NEEDS_REVIEW';
  if (firstStartsAt > now) return 'UPCOMING';
  if (lastEndsAt < now) return 'ENDED';
  return 'IN_PROGRESS';
}
import type { Prisma } from '@prisma/client';

export async function latestCalendarRows(
  database: Prisma.TransactionClient,
  organizationId: string,
) {
  const batch = await database.importBatch.findFirst({
    where: { organizationId, status: { in: ['VALIDATED', 'RECONCILED', 'FINALIZED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!batch) return [];
  const files = await database.importSourceFile.findMany({
    where: { organizationId, batchId: batch.id },
    select: { id: true },
  });
  const rows = await database.importRow.findMany({
    where: {
      organizationId,
      sourceFileId: { in: files.map(({ id }) => id) },
      sheetName: 'Annual Calendar - 2026',
    },
    select: { disposition: true, normalizedValues: true },
  });
  return rows.flatMap((row) => {
    const value = row.normalizedValues;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const cohortCode = value.cohortCode;
    const startsAt = value.startsAt;
    const endsAt = value.endsAt;
    if (
      typeof cohortCode !== 'string' ||
      typeof startsAt !== 'string' ||
      typeof endsAt !== 'string'
    )
      return [];
    return [{ disposition: row.disposition, cohortCode, startsAt, endsAt }];
  });
}
