import type { Prisma } from '@prisma/client';
import type { CalendarValue } from './import-values';

export function groupCalendarPrograms(values: Array<{ value: CalendarValue }>) {
  const programs = new Map<string, { code: string; name: string; modules: Set<string> }>();
  for (const { value } of values) {
    const current = programs.get(value.programCode) ?? {
      code: value.programCode,
      name: value.programName,
      modules: new Set<string>(),
    };
    current.modules.add(value.moduleName);
    programs.set(value.programCode, current);
  }
  return [...programs.values()].map((program) => ({ ...program, modules: [...program.modules] }));
}

export async function updateCohortScheduleBounds(
  db: Prisma.TransactionClient,
  cohortId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<void> {
  const cohort = await db.cohort.findUniqueOrThrow({ where: { id: cohortId } });
  const startsOn = dateOnly(startsAt);
  const endsOn = dateOnly(endsAt);
  await db.cohort.update({
    where: { id: cohortId },
    data: {
      ...(!cohort.startsOn || startsOn < cohort.startsOn ? { startsOn } : {}),
      ...(!cohort.endsOn || endsOn > cohort.endsOn ? { endsOn } : {}),
    },
  });
}

function dateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
