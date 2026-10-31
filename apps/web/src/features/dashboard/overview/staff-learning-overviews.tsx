'use client';

import type { StaffOverview, WorkspaceOverview } from '@academyops/api-client/workspace-overview';
import { RiArrowRightLine } from '@remixicon/react';
import { Book1, Calendar1, ClipboardTick, Profile2User } from 'iconsax-react';
import { ButtonLink } from '@/components/base/buttons/button';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';
import type { Locale } from '@/lib/locales';
import { formatCount } from './formatters';
import styles from './staff-overview-styles';
import {
  Agenda,
  Empty,
  Mini,
  Note,
  Panel,
  Pills,
  SeriesChart,
  StateDonut,
  StateRanking,
  Status,
  series,
  staffDate,
} from './staff-overview-ui';
export type Props<K extends StaffOverview['kind']> = {
  data: Extract<StaffOverview, { kind: K }>;
  queue: WorkspaceOverview['queue'];
  locale: Locale;
};

function AcademicArrow({ className }: { className?: string }) {
  return <RiArrowRightLine aria-hidden className={className} />;
}

export function OperationsOverview({ data, queue, locale }: Props<'OPERATIONS'>) {
  const c = getStaffOverviewCopy(locale);
  return (
    <div className={`${styles.grid} ${styles.operationsGrid}`} data-staff-layout="OPERATIONS">
      <div className={styles.stack}>
        <Panel title={c.weekAhead} hint={c.weekAheadHint} icon={Calendar1}>
          <SeriesChart
            title={c.weekAhead}
            locale={locale}
            data={data.days.map((d) => ({
              ...d,
              label: staffDate(d.date, locale, { month: 'numeric', day: 'numeric' }),
            }))}
            series={[
              series('scheduled', c.states.SCHEDULED ?? c.unknown),
              series('completed', c.states.COMPLETED ?? c.unknown, '#14b8a6'),
            ]}
          />
        </Panel>
        <Agenda queue={queue} title={c.operations.agenda} locale={locale} sessionLinks />
      </div>
      <div className={styles.stack}>
        <Panel
          title={c.operations.preparation}
          hint={c.operations.preparationHint}
          icon={ClipboardTick}
          tone="orange"
        >
          <div className={styles.miniGrid}>
            <Mini
              label={c.operations.missingRoom}
              value={formatCount(data.preparation.missingRoom, locale)}
            />
            <Mini
              label={c.operations.missingTrainer}
              value={formatCount(data.preparation.missingTrainer, locale)}
            />
          </div>
          {!data.preparation.missingRoom && !data.preparation.missingTrainer ? (
            <Note>{c.operations.ready}</Note>
          ) : null}
          <h3 className="mt-6 mb-3 text-sm font-medium">{c.operations.delivery}</h3>
          <Pills items={data.deliveryModes} locale={locale} />
          <div className="mt-5">
            <ButtonLink variant="secondary" href={`/${locale}/sessions`}>
              {managementText(locale, 'sessions')}
            </ButtonLink>
          </div>
        </Panel>
        <Panel
          title={c.operations.registrations}
          hint={c.allVisible}
          icon={Profile2User}
          tone="purple"
        >
          <StateRanking items={data.registrations} locale={locale} />
          <div className="mt-auto pt-5">
            <ButtonLink
              variant="secondary"
              href={
                data.registrations.some((r) => r.key === 'PENDING_APPROVAL' && r.value > 0)
                  ? `/${locale}/enrollments?status=PENDING_APPROVAL`
                  : `/${locale}/enrollments`
              }
            >
              {getAcademyCopy(locale).enrollments}
            </ButtonLink>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function AcademicOverview({ data, queue, locale }: Props<'ACADEMIC'>) {
  const c = getStaffOverviewCopy(locale);
  return (
    <div className={styles.stack} data-staff-layout="ACADEMIC">
      <div className={`${styles.grid} ${styles.reverse} ${styles.academicGrid}`}>
        <Panel
          title={c.academic.plan}
          hint={c.academic.planHint}
          icon={Book1}
          tone="purple"
          className="flex flex-col"
          bodyClassName="grid flex-1 content-center"
        >
          <StateDonut data={data.sessionStates} locale={locale} title={c.academic.plan} />
          <div className="mt-5">
            <ButtonLink
              variant="secondary"
              trailingIcon={AcademicArrow}
              className={styles.academicAction}
              href={`/${locale}/sessions`}
            >
              {managementText(locale, 'sessions')}
            </ButtonLink>
          </div>
        </Panel>
        <Panel title={c.academic.groups} hint={c.academic.groupsHint} icon={Profile2User}>
          {data.cohorts.items.length ? (
            <ul className={styles.list}>
              {data.cohorts.items.map((g) => {
                const total = g.scheduled + g.completed + g.draft;
                return (
                  <li key={g.id} className={styles.listItem}>
                    <div className={styles.row}>
                      <h3>
                        <ButtonLink
                          variant="ghost"
                          size="small"
                          className={`${styles.academicRecordLink} text-start`}
                          href={`/${locale}/academic/cohorts?record=${encodeURIComponent(g.id)}`}
                        >
                          <bdi>{g.name}</bdi>
                        </ButtonLink>
                      </h3>
                      <Status state={g.status} locale={locale} />
                    </div>
                    <p className={`${styles.muted} mt-2 mb-2`}>
                      {c.academic.progress
                        .replace('{completed}', formatCount(g.completed, locale))
                        .replace('{total}', formatCount(total, locale))}
                    </p>
                    <meter
                      className={styles.meter}
                      aria-label={`${g.name}: ${c.states.COMPLETED}`}
                      min={0}
                      max={Math.max(1, total)}
                      value={g.completed}
                    />
                    <p className={`${styles.muted} mt-2`}>
                      {c.academic.scheduled}: {formatCount(g.scheduled, locale)} ·{' '}
                      {c.academic.drafts}: {formatCount(g.draft, locale)} · {c.academic.cancelled}:{' '}
                      {formatCount(g.cancelled, locale)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty locale={locale} />
          )}
          <p className={styles.foot}>
            {c.preview
              .replace('{shown}', formatCount(data.cohorts.items.length, locale))
              .replace('{total}', formatCount(data.cohorts.total, locale))}
          </p>
          <div className="mt-5">
            <ButtonLink
              variant="secondary"
              trailingIcon={AcademicArrow}
              className={styles.academicAction}
              href={`/${locale}/academic/cohorts`}
            >
              {getAcademyCopy(locale).cohorts}
            </ButtonLink>
          </div>
        </Panel>
      </div>
      <Agenda queue={queue} title={c.academic.next} locale={locale} sessionLinks />
    </div>
  );
}

export { AttendanceOverview, TrainerOverview } from './staff-attendance-overviews';
