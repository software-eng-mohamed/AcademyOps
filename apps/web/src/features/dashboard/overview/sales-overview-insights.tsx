'use client';

import { Chart2, Profile2User, UserSearch } from 'iconsax-react';
import type { ResponseSalesDashboardControllerOverviewResponse } from '@/api/generated/models/responseSalesDashboardControllerOverviewResponse';
import { ButtonLink } from '@/components/base/buttons/button';
import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';
import type { Locale } from '@/lib/locales';
import { formatCount } from './formatters';
import styles from './staff-overview-styles';
import {
  Note,
  Panel,
  RankedValues,
  SeriesChart,
  series,
  staffDate,
  statusColors,
} from './staff-overview-ui';

export function SalesOverviewInsights({
  data,
  locale,
}: {
  data: NonNullable<ResponseSalesDashboardControllerOverviewResponse['insights']>;
  locale: Locale;
}) {
  const c = getStaffOverviewCopy(locale);
  const stages = ['NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED'];
  const total = data.states.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className={styles.stack} data-staff-layout="SALES">
      <Panel title={c.sales.pipeline} hint={c.sales.pipelineHint} icon={Profile2User} tone="purple">
        <div className={styles.pipeline}>
          {stages.map((key) => {
            const value = data.states.find((s) => s.key === key)?.value ?? 0;
            return (
              <div key={key} className={styles.stage}>
                <ButtonLink variant="ghost" size="small" href={`/${locale}/leads?status=${key}`}>
                  {c.states[key]}
                </ButtonLink>
                <strong>{formatCount(value, locale)}</strong>
                <div className={styles.track} aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${total ? (value / total) * 100 : 0}%`,
                      background: statusColors[key],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <Note>
          <span>
            <strong className="text-text-primary">
              {formatCount(data.withoutNextAction, locale)} {c.sales.withoutAction}
            </strong>
            <br />
            {c.sales.followupHint}
          </span>
        </Note>
      </Panel>
      <div className={styles.grid}>
        <Panel title={c.sales.trend} hint={c.last28} icon={Chart2}>
          <SeriesChart
            title={c.sales.trend}
            kind="line"
            locale={locale}
            data={data.days.map((d) => ({ label: staffDate(d.date, locale), count: d.count }))}
            series={[series('count', c.sales.trend)]}
          />
        </Panel>
        <Panel title={c.sales.sources} hint={c.sales.sourcesHint} icon={UserSearch} tone="orange">
          <RankedValues
            locale={locale}
            items={data.sources.map((s, i) => ({
              key: `${i}`,
              label: s.source ?? c.sales.noSource,
              value: s.count,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
