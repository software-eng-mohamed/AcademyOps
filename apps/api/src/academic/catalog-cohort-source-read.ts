import type { PrismaService } from '../platform/database/prisma.service';
import { cohortIntakeSummary, emptyIntakeCounts, readCohortIntakeCounts } from './cohort-intake';
import { deriveCohortScheduleState, normalizeCohortSourceCode } from './cohort-source-data';

export async function enrichCohorts<
  T extends { id: string; code: string; capacity: number | null; status?: string },
>(prisma: PrismaService, organizationId: string, cohorts: T[]) {
  if (!cohorts.length) return [];
  const allCohorts = await prisma.cohort.findMany({
    where: { organizationId },
    select: { id: true, code: true },
  });
  const requestedKeys = new Set(cohorts.map(({ code }) => normalizeCohortSourceCode(code)));
  const aliases = allCohorts.filter(({ code }) =>
    requestedKeys.has(normalizeCohortSourceCode(code)),
  );
  const aliasIds = aliases.map(({ id }) => id);
  const [sessions, assignments, sourceRows, intakeCounts] = await Promise.all([
    prisma.session.findMany({
      where: { organizationId, cohortId: { in: aliasIds }, startsAt: { not: null } },
      select: { cohortId: true, startsAt: true, endsAt: true, status: true },
    }),
    prisma.enrollmentCohortAssignment.findMany({
      where: { organizationId, cohortId: { in: aliasIds }, endsAt: null },
      select: { cohortId: true, enrollmentId: true },
    }),
    latestCalendarRows(prisma, organizationId),
    readCohortIntakeCounts(
      prisma,
      organizationId,
      cohorts.map(({ id }) => id),
    ),
  ]);
  return cohorts.map((cohort) => {
    const key = normalizeCohortSourceCode(cohort.code);
    const matchingAliases = aliases.filter(({ code }) => normalizeCohortSourceCode(code) === key);
    const matchingIds = new Set(matchingAliases.map(({ id }) => id));
    const matchingSessions = sessions.filter(({ cohortId }) => matchingIds.has(cohortId));
    const matchingRows = sourceRows.filter(
      ({ cohortCode }) => normalizeCohortSourceCode(cohortCode) === key,
    );
    const starts = matchingRows.length
      ? matchingRows.map(({ startsAt }) => new Date(startsAt))
      : matchingSessions.flatMap(({ startsAt }) => (startsAt ? [startsAt] : []));
    const ends = matchingRows.length
      ? matchingRows.map(({ endsAt }) => new Date(endsAt))
      : matchingSessions.flatMap(({ endsAt }) => (endsAt ? [endsAt] : []));
    const firstStartsAt = starts.length
      ? new Date(Math.min(...starts.map((value) => value.getTime())))
      : null;
    const lastEndsAt = ends.length
      ? new Date(Math.max(...ends.map((value) => value.getTime())))
      : null;
    const conflictCount = matchingRows.filter(
      ({ disposition }) => disposition === 'QUARANTINED',
    ).length;
    const learnerCount = new Set(
      assignments
        .filter(({ cohortId }) => matchingIds.has(cohortId))
        .map(({ enrollmentId }) => enrollmentId),
    ).size;
    const intake = cohortIntakeSummary(
      { status: cohort.status ?? 'PLANNED', capacity: cohort.capacity },
      intakeCounts.get(cohort.id) ?? emptyIntakeCounts(),
    );
    return {
      ...cohort,
      ...intake,
      scheduleFirstAt: firstStartsAt?.toISOString() ?? null,
      scheduleLastAt: lastEndsAt?.toISOString() ?? null,
      sourceSessionCount: matchingRows.length,
      scheduledSessionCount: matchingSessions.filter(({ status }) => status !== 'DRAFT').length,
      scheduleConflictCount: conflictCount,
      scheduleState: deriveCohortScheduleState(firstStartsAt, lastEndsAt, conflictCount),
      learnerCount,
      sourceAliases: matchingAliases.map(({ code }) => code),
      capacitySource: cohort.capacity === null ? 'NOT_PROVIDED' : 'SYSTEM',
    };
  });
}

async function latestCalendarRows(prisma: PrismaService, organizationId: string) {
  const batch = await prisma.importBatch.findFirst({
    where: { organizationId, status: { in: ['VALIDATED', 'RECONCILED', 'FINALIZED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!batch) return [];
  const files = await prisma.importSourceFile.findMany({
    where: { organizationId, batchId: batch.id },
    select: { id: true },
  });
  const rows = await prisma.importRow.findMany({
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
