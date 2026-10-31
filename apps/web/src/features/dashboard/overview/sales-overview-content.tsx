import { Calendar1, CalendarTick, ChartSuccess, Clock, Profile2User, UserAdd } from 'iconsax-react';
import type { ResponseSalesDashboardControllerOverviewResponse } from '@/api/generated/models/responseSalesDashboardControllerOverviewResponse';
import { StatCards } from '@/components/application/dashboard/stat-cards';
import { Chip } from '@/components/base/badges/chip';
import { ButtonLink } from '@/components/base/buttons/button';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { getSalesOverviewCopy } from '@/i18n/sales-overview-copy';
import type { Locale } from '@/lib/locales';
import { formatCount, formatDateTime } from './formatters';
import { SalesOverviewInsights } from './sales-overview-insights';
import styles from './sales-overview-styles';

function LeadsIcon({ className }: { className?: string }) {
  return (
    <Profile2User aria-hidden className={className} color="currentColor" size={20} variant="Bulk" />
  );
}
function NewLeadIcon({ className }: { className?: string }) {
  return (
    <UserAdd aria-hidden className={className} color="currentColor" size={20} variant="Bulk" />
  );
}
function ConversionIcon({ className }: { className?: string }) {
  return (
    <ChartSuccess aria-hidden className={className} color="currentColor" size={20} variant="Bulk" />
  );
}

export function SalesOverviewContent({
  overview,
  locale,
}: {
  overview: ResponseSalesDashboardControllerOverviewResponse;
  locale: Locale;
}) {
  const copy = getSalesOverviewCopy(locale);
  const count = (value: number) => formatCount(value, locale);
  return (
    <div className="space-y-5" data-sales-overview-content>
      <StatCards
        className="gap-3 sm:grid-cols-3 sm:gap-4"
        columns={1}
        variant="overview"
        stats={[
          {
            icon: LeadsIcon,
            label: copy.metrics.open,
            value: count(overview.metrics.openLeads),
            caption: copy.metrics.openCaption,
            tone: 'blue',
          },
          {
            icon: NewLeadIcon,
            label: copy.metrics.new,
            value: count(overview.metrics.newLeadsThisMonth),
            caption: copy.metrics.newCaption,
            tone: 'purple',
          },
          {
            icon: ConversionIcon,
            label: copy.metrics.converted,
            value: count(overview.metrics.convertedLeadsThisMonth),
            caption: copy.metrics.convertedCaption,
            tone: 'emerald',
          },
        ]}
      />
      {overview.insights ? (
        <SalesOverviewInsights data={overview.insights} locale={locale} />
      ) : null}
      <section aria-labelledby="sales-follow-ups" className={styles.followUps}>
        <div className={styles.followUpsHeader}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={styles.sectionIcon}>
              <Calendar1 aria-hidden color="currentColor" size={20} variant="Bulk" />
            </span>
            <div>
              <h2 className={styles.sectionTitle} id="sales-follow-ups">
                {copy.followUps.title}
              </h2>
              <p className={styles.sectionDescription}>{copy.followUps.description}</p>
            </div>
          </div>
          <Chip className={styles.today} color="blue" variant="caption">
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {copy.followUps.scheduledToday.replace(
              '{count}',
              count(overview.metrics.followUpsToday),
            )}
          </Chip>
        </div>
        {overview.followUps.items.length ? (
          <ul className={styles.queue}>
            {overview.followUps.items.map((item) => (
              <li className={styles.queueItem} key={item.id}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span aria-hidden className={styles.leadIcon}>
                    <Profile2User color="currentColor" size={20} variant="Bulk" />
                  </span>
                  <div className="min-w-0">
                    <h3 className={styles.leadName}>
                      <ButtonLink
                        variant="ghost"
                        size="small"
                        className="h-auto max-w-full whitespace-normal text-start [&_span]:min-w-0 [&_span]:shrink"
                        href={`/${locale}/leads?record=${encodeURIComponent(item.id)}`}
                      >
                        <bdi>{item.name?.trim() || copy.followUps.unnamed}</bdi>
                      </ButtonLink>
                    </h3>
                    <p className={styles.sectionDescription}>
                      <bdi>{item.stageName?.trim() || copy.followUps.noStage}</bdi>
                    </p>
                  </div>
                </div>
                <div className={styles.queueMeta}>
                  <time dateTime={item.nextActionAt}>
                    {formatDateTime(item.nextActionAt, locale)}
                  </time>
                  <Chip color={item.status === 'OVERDUE' ? 'yellow' : 'blue'} variant="caption">
                    {item.status === 'OVERDUE' ? copy.followUps.overdue : copy.followUps.today}
                  </Chip>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <CalendarTick aria-hidden color="currentColor" size={26} variant="Bulk" />
            </span>
            <div className="min-w-0">
              <h3 className={styles.emptyTitle}>{copy.followUps.emptyTitle}</h3>
              <p className={styles.emptyDescription}>{copy.followUps.emptyDescription}</p>
            </div>
          </div>
        )}
        <div className={styles.footer}>
          <ButtonLink variant="secondary" href={`/${locale}/leads`}>
            {getAcademyCopy(locale).leads}
          </ButtonLink>
          <p>
            {overview.followUps.items.length
              ? copy.followUps.preview
                  .replace('{shown}', count(overview.followUps.items.length))
                  .replace('{total}', count(overview.followUps.total))
              : copy.followUps.emptyFootnote}
          </p>
          <span className="inline-flex items-center gap-1.5">
            <Clock aria-hidden color="currentColor" size={14} variant="Bulk" />
            {copy.followUps.timezone}
          </span>
        </div>
      </section>
    </div>
  );
}
