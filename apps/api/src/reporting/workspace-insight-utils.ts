import { Prisma } from '@prisma/client';
import { cairoMidnight, cairoParts } from './dashboard-utils';

export function dayKey(date: Date): string {
  const { year, month, day } = cairoParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function overviewDays(now: Date, offset: number, length: number) {
  const { year, month, day } = cairoParts(now);
  return Array.from({ length }, (_, index) =>
    dayKey(cairoMidnight(year, month, day + offset + index)),
  );
}

/** IDs originate only from the existing domain access services; empty means no access. */
export function visibleIdsSql(column: Prisma.Sql, ids: string[] | undefined): Prisma.Sql {
  return ids === undefined
    ? Prisma.sql`TRUE`
    : ids.length
      ? Prisma.sql`${column} IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`
      : Prisma.sql`FALSE`;
}
