const CAIRO_TIME_ZONE = 'Africa/Cairo';

type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const cairoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function cairoWallTimeToIso(value: string): string {
  const wall = parseWallTime(value);
  const matches = wall ? matchingInstants(wall) : [];
  const instant = matches.length === 1 ? matches[0] : undefined;
  if (instant === undefined) throw new RangeError('Invalid or ambiguous Cairo wall time');
  return new Date(instant).toISOString();
}

export function isCairoWallTime(value: string): boolean {
  const wall = parseWallTime(value);
  return Boolean(wall && matchingInstants(wall).length === 1);
}

export function instantToCairoDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid instant');
  const parts = cairoParts(date.getTime());
  return `${number(parts.year, 4)}-${number(parts.month)}-${number(parts.day)}T${number(parts.hour)}:${number(parts.minute)}`;
}

export function cairoDayRange(value: string): { from: string; to: string } {
  const date = parseDate(value);
  if (!date) throw new RangeError('Invalid Cairo date');
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  const from = firstInstantOfCairoDate(date);
  const nextFrom = firstInstantOfCairoDate({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
  return { from: new Date(from).toISOString(), to: new Date(nextFrom - 1).toISOString() };
}

function firstInstantOfCairoDate(date: Pick<WallTime, 'year' | 'month' | 'day'>): number {
  for (let minute = 0; minute <= 180; minute += 1) {
    const matches = matchingInstants({
      ...date,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
      second: 0,
      millisecond: 0,
    });
    const instant = matches[0];
    if (instant !== undefined) return instant;
  }
  throw new RangeError('Cairo date has no valid start');
}

function matchingInstants(wall: WallTime): number[] {
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6)
    offsets.add(cairoOffset(wallAsUtc + hours * 3600000));
  return [...offsets]
    .map((offset) => wallAsUtc - offset)
    .filter((instant) => sameWallTime(cairoParts(instant), wall))
    .sort((left, right) => left - right);
}

function cairoOffset(instant: number): number {
  const wholeSecond = Math.floor(instant / 1000) * 1000;
  const parts = cairoParts(wholeSecond);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    wholeSecond
  );
}

function cairoParts(instant: number): Omit<WallTime, 'millisecond'> {
  const parts = cairoFormatter.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

function parseWallTime(value: string): WallTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
    value,
  );
  if (!match) return null;
  const wall: WallTime = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? '').padEnd(3, '0') || 0),
  };
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  if (
    date.getUTCFullYear() !== wall.year ||
    date.getUTCMonth() + 1 !== wall.month ||
    date.getUTCDate() !== wall.day ||
    wall.hour > 23 ||
    wall.minute > 59 ||
    wall.second > 59
  )
    return null;
  return wall;
}

function parseDate(value: string): Pick<WallTime, 'year' | 'month' | 'day'> | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const wall = match ? parseWallTime(`${value}T00:00`) : null;
  return wall ? { year: wall.year, month: wall.month, day: wall.day } : null;
}

function sameWallTime(parts: Omit<WallTime, 'millisecond'>, wall: WallTime): boolean {
  return (
    parts.year === wall.year &&
    parts.month === wall.month &&
    parts.day === wall.day &&
    parts.hour === wall.hour &&
    parts.minute === wall.minute &&
    parts.second === wall.second
  );
}

const number = (value: number, width = 2) => String(value).padStart(width, '0');
