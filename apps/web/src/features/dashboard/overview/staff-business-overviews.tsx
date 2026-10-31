'use client';

import type { StaffOverview, WorkspaceOverview } from '@academyops/api-client/workspace-overview';
import {
  Chart2,
  Clock,
  DocumentText,
  MessageText,
  Profile2User,
  Receipt,
  TickCircle,
  Wallet2,
  Wifi,
} from 'iconsax-react';
import { Chip } from '@/components/base/badges/chip';
import { ButtonLink } from '@/components/base/buttons/button';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';
import { systemText } from '@/i18n/system-copy';
import { getWorkspaceOverviewCopy } from '@/i18n/workspace-overview-copy';
import type { Locale } from '@/lib/locales';
import { formatCount, formatDateTime } from './formatters';
import styles from './staff-overview-styles';
import {
  Agenda,
  Empty,
  Mini,
  Note,
  Panel,
  RankedValues,
  SeriesChart,
  StateRanking,
  Status,
  series,
  staffDate,
  staffMoney,
} from './staff-overview-ui';

type Props<K extends StaffOverview['kind']> = {
  data: Extract<StaffOverview, { kind: K }>;
  queue: WorkspaceOverview['queue'];
  locale: Locale;
};

export function ReceptionOverview({ data, queue, locale }: Props<'RECEPTION'>) {
  const c = getStaffOverviewCopy(locale);
  return (
    <div className={`${styles.grid} ${styles.receptionGrid}`} data-staff-layout="RECEPTION">
      <div className={styles.stack}>
        <Panel title={c.reception.trend} hint={c.last28} icon={Chart2}>
          <SeriesChart
            title={c.reception.trend}
            kind="line"
            locale={locale}
            data={data.days.map((d) => ({ label: staffDate(d.date, locale), count: d.count }))}
            series={[series('count', c.registrations)]}
          />
        </Panel>
        <Agenda
          queue={queue}
          title={c.reception.agenda}
          locale={locale}
          hideEmptyCount
          sessionLinks
        />
      </div>
      <div className={styles.stack}>
        <Panel title={c.reception.states} hint={c.allVisible} icon={Profile2User} tone="purple">
          <StateRanking items={data.states} locale={locale} />
          <div className="mt-5">
            <ButtonLink variant="secondary" href={`/${locale}/enrollments?status=DRAFT`}>
              {getAcademyCopy(locale).enrollments}
            </ButtonLink>
          </div>
        </Panel>
        <Panel
          title={c.reception.recent}
          hint={c.reception.recentHint}
          icon={DocumentText}
          tone="orange"
        >
          {data.recent.length ? (
            <ul className={styles.list}>
              {data.recent.map((r) => (
                <li className={styles.listItem} key={r.id}>
                  <div className={styles.row}>
                    <div>
                      <h3>
                        <ButtonLink
                          variant="ghost"
                          size="small"
                          className="h-auto max-w-full whitespace-normal text-start [&_span]:min-w-0 [&_span]:shrink"
                          href={`/${locale}/enrollments?record=${encodeURIComponent(r.id)}`}
                        >
                          <bdi>{r.course ?? c.course}</bdi>
                        </ButtonLink>
                      </h3>
                      <p className={styles.muted}>
                        <time dateTime={r.createdAt}>{formatDateTime(r.createdAt, locale)}</time>
                      </p>
                    </div>
                    <Status state={r.state} locale={locale} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty locale={locale} />
          )}
        </Panel>
      </div>
    </div>
  );
}

export function AccountsOverview({ data, queue, locale }: Props<'ACCOUNTS'>) {
  const c = getStaffOverviewCopy(locale);
  return (
    <div className={styles.stack} data-staff-layout="ACCOUNTS">
      <div className={`${styles.grid} ${styles.accountsGrid}`}>
        <Panel
          title={c.accounts.collections}
          hint={c.accounts.collectionsHint}
          icon={Wallet2}
          tone="emerald"
        >
          <p className={styles.muted}>{c.accounts.month}</p>
          <p className="mt-2 mb-5 text-2xl font-semibold tabular-nums">
            <bdi>{staffMoney(data.monthPostedAmount, locale)}</bdi>
          </p>
          <SeriesChart
            title={c.accounts.collections}
            unit="money"
            barStyle="rounded"
            locale={locale}
            data={data.months.map((m) => ({
              label: staffDate(`${m.month}-01`, locale, { month: 'short', year: '2-digit' }),
              amount: Number(m.amount),
            }))}
            series={[series('amount', c.accounts.collections, '#14b8a6')]}
          />
        </Panel>
        <div className={styles.stack}>
          <Panel
            title={c.accounts.pending}
            hint={c.accounts.pendingHint}
            icon={Clock}
            tone="orange"
          >
            <div className={styles.miniGrid}>
              <Mini label={c.accounts.pending} value={formatCount(data.pending.count, locale)} />
              <Mini
                label={c.accounts.pendingAmount}
                value={<bdi>{staffMoney(data.pending.amount, locale)}</bdi>}
              />
            </div>
            <ButtonLink
              className="mt-4"
              variant="secondary"
              href={`/${locale}/payments?status=PENDING_VERIFICATION`}
            >
              {managementText(locale, 'payments')}
            </ButtonLink>
          </Panel>
          <Panel title={c.accounts.methods} hint={c.accounts.methodsHint} icon={Receipt}>
            <RankedValues
              locale={locale}
              money
              items={data.methods.map((m, i) => ({
                key: `${i}`,
                label: m.name ?? c.unknown,
                value: Number(m.amount),
                color: '#14b8a6',
              }))}
            />
          </Panel>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink variant="secondary" href={`/${locale}/finance`}>
          {managementText(locale, 'finance')}
        </ButtonLink>
        <ButtonLink variant="secondary" href={`/${locale}/documents`}>
          {managementText(locale, 'documents')}
        </ButtonLink>
      </div>
      <Agenda queue={queue} title={c.accounts.payments} locale={locale} paymentLinks />
    </div>
  );
}

export function OtpOverview({
  data,
  channel,
  locale,
}: {
  data: Extract<StaffOverview, { kind: 'OTP_OPERATOR' }>;
  channel: WorkspaceOverview['channel'];
  locale: Locale;
}) {
  const c = getStaffOverviewCopy(locale);
  const base = getWorkspaceOverviewCopy(locale);
  return (
    <div className={styles.stack} data-staff-layout="OTP_OPERATOR">
      <div className={styles.grid}>
        <Panel title={c.otp.health} hint={c.otp.privacy} icon={Wifi} tone="emerald">
          {channel ? (
            <>
              {[
                { label: c.otp.enabled, ready: channel.enabled },
                { label: c.otp.connected, ready: channel.state === 'CONNECTED' },
                { label: c.otp.ready, ready: channel.otpAvailable },
              ].map((step) => (
                <div className={styles.healthRow} key={step.label}>
                  <span>
                    <TickCircle
                      variant="Bulk"
                      size={18}
                      color={step.ready ? 'var(--sales-green)' : 'var(--sales-muted)'}
                      aria-hidden
                    />
                    {step.label}
                  </span>
                  <Chip color={step.ready ? 'lime' : 'yellow'}>
                    {step.ready ? c.otp.yes : c.otp.no}
                  </Chip>
                </div>
              ))}
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className={styles.muted}>{base.channel.phone}</dt>
                  <dd className="mt-1 text-sm">
                    <bdi>{channel.phoneMasked ?? base.channel.noPhone}</bdi>
                  </dd>
                </div>
                <div>
                  <dt className={styles.muted}>{base.channel.heartbeat}</dt>
                  <dd className="mt-1 text-sm">
                    {channel.lastHeartbeatAt
                      ? formatDateTime(channel.lastHeartbeatAt, locale)
                      : base.channel.never}
                  </dd>
                </div>
              </dl>
              {channel.needsQr ? <Note>{base.channel.qrNeeded}</Note> : null}
              <ButtonLink href={`/${locale}/whatsapp`} variant="secondary" className="mt-5">
                {systemText(locale, 'whatsapp')}
              </ButtonLink>
            </>
          ) : (
            <Empty locale={locale} />
          )}
        </Panel>
        <Panel title={c.otp.dispatch} icon={MessageText} tone="orange">
          <div className={styles.miniGrid}>
            <Mini label={c.otp.pending} value={formatCount(data.pendingDispatch, locale)} />
            <Mini label={c.otp.retrying} value={formatCount(data.retryingDispatch, locale)} />
          </div>
          <Note>{c.otp.note}</Note>
          <p className={`${styles.muted} mt-5`}>{c.otp.last}</p>
          <p className="mt-1 text-sm">
            {data.lastRequestAt ? (
              <time dateTime={data.lastRequestAt}>
                {formatDateTime(data.lastRequestAt, locale)}
              </time>
            ) : (
              c.otp.never
            )}
          </p>
        </Panel>
      </div>
      <Panel title={c.otp.requests} hint={c.last7} icon={Chart2}>
        <p className="mb-4 flex items-baseline gap-2">
          <strong className="text-2xl font-semibold tabular-nums">
            {formatCount(
              data.days.reduce((sum, d) => sum + d.count, 0),
              locale,
            )}
          </strong>
          <span className={styles.muted}>{c.otp.requestCount}</span>
        </p>
        <SeriesChart
          title={c.otp.requests}
          locale={locale}
          data={data.days.map((d) => ({
            label: staffDate(d.date, locale, { month: 'numeric', day: 'numeric' }),
            count: d.count,
          }))}
          series={[series('count', c.otp.requests)]}
        />
      </Panel>
    </div>
  );
}
