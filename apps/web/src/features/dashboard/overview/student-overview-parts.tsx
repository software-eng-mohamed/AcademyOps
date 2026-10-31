'use client';

import type { Icon } from 'iconsax-react';

import type { ReactNode } from 'react';
import {
  DashboardIconTile,
  type DashboardIconTone,
} from '@/components/application/dashboard/dashboard-icon-tile';
import { Chip } from '@/components/base/badges/chip';

import type { getStudentOverviewCopy } from '@/i18n/student-overview-copy';
import type { Locale } from '@/lib/locales';
import { localeTag } from './formatters';
import styles from './student-overview-styles';
export type Copy = ReturnType<typeof getStudentOverviewCopy>;

export const date = (value: string, locale: Locale, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(localeTag(locale), { timeZone: 'Africa/Cairo', ...options }).format(
    new Date(value),
  );

export const studentDayKey = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

export function studentWeekDays(from: string) {
  const start = new Date(`${studentDayKey(from)}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(start.getTime() + index * 86_400_000).toISOString(),
  );
}

export function Section({
  title,
  hint,
  icon: IconComponent,
  children,
  tone = 'blue',
}: {
  title: string;
  hint?: string;
  icon: Icon;
  children: ReactNode;
  tone?: DashboardIconTone;
}) {
  return (
    <section aria-label={title} className={styles.card}>
      <header className={styles.heading}>
        <DashboardIconTile tone={tone}>
          <IconComponent size={20} color="currentColor" variant="Bulk" />
        </DashboardIconTile>
        <div>
          <h2>{title}</h2>
          {hint ? <p className={styles.muted}>{hint}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {hint ? <p className={styles.muted}>{hint}</p> : null}
    </div>
  );
}

export function Status({ state, copy }: { state: string; copy: Copy }) {
  return (
    <Chip
      color={
        state === 'OVERDUE' ? 'rose' : state === 'COMPLETED' || state === 'ACTIVE' ? 'lime' : 'blue'
      }
    >
      {copy.states[state] ?? copy.unknownStatus}
    </Chip>
  );
}
