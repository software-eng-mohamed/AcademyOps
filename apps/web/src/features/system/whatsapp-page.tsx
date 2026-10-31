'use client';

import { AcademyCard } from '@academyops/ui/academy';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Element3 } from 'iconsax-react';
import { useEffect, useState } from 'react';
import { readChannel } from '@/api/system/commands';
import { systemKey } from '@/api/system/queries';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-styles';
import { DirectoryHeading } from '@/features/academy/academy-surfaces';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { isStepUpRequired, StepUpDialog } from '@/features/academy/step-up-dialog';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission } from '@/features/dashboard/navigation';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { systemText } from '@/i18n/system-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';
import { SystemIcon, SystemStatus, SystemValue } from './system-ui';
import { type ChannelAction, ChannelDialog, PairingCode } from './whatsapp-pairing-controls';

export function WhatsappPage({ user }: { user: DashboardUser }) {
  const locale = useDocumentLocale();
  const copy = getAcademyCopy(locale);
  const t = (key: string) => systemText(locale, key);
  const client = useQueryClient();
  const [command, setCommand] = useState<{ action: ChannelAction; version: number }>();
  const [showQr, setShowQr] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const query = useQuery({
    queryKey: [...systemKey(user.id), 'channel'],
    queryFn: ({ signal }) => readChannel(signal),
    refetchInterval: (current) => (current.state.error ? false : 10_000),
    refetchIntervalInBackground: false,
    gcTime: 0,
    retry: false,
  });
  const data = query.data;
  useEffect(() => {
    setStepUp(isStepUpRequired(query.error));
  }, [query.error]);
  const canManage = hasPermission(user, 'messaging.otp.manage', ['O']);
  const needsQr = data?.needsQr === true && !query.isError;
  useEffect(() => {
    if (!needsQr) setShowQr(false);
  }, [needsQr]);
  const startCommand = (action: ChannelAction) => {
    if (!data || query.isError || !canManage || !Number.isInteger(data.version)) return;
    setShowQr(false);
    // Freeze the version the operator reviewed; background polling must not silently
    // acknowledge a newer state while this confirmation is open.
    setCommand({ action, version: data.version });
  };
  return (
    <div className={styles.page} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className={styles.container}>
        <Breadcrumb aria-label={t('system')} className="mb-6 min-h-10 [&>ol]:px-0">
          <BreadcrumbItem
            className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
            href={`/${locale}/dashboard`}
          >
            <Element3 aria-hidden size={16} color="currentColor" variant="Bulk" />
            {copy.dashboard}
          </BreadcrumbItem>
          <BreadcrumbItem className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary">
            {t('system')}
          </BreadcrumbItem>
          <BreadcrumbItem
            className="rounded-lg bg-linear-to-r from-accent-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
            current
          >
            {t('whatsapp')}
          </BreadcrumbItem>
        </Breadcrumb>
        <DirectoryHeading
          title={t('whatsapp')}
          description={t('whatsappDescription')}
          icon={<SystemIcon section="whatsapp" className="size-7" />}
        >
          <Button
            variant="secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t('refreshChannel')}
          </Button>
        </DirectoryHeading>
        <div className={`${styles.canvas} py-6`}>
          {query.isPending ? (
            <p role="status">{copy.loading}</p>
          ) : query.isError ? (
            <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
          ) : data ? (
            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <AcademyCard className={styles.recordCard ?? ''} data-library-component="heroui/card">
                <AcademyCard.Header className="p-5 pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <AcademyCard.Title className="text-lg text-ink">
                      {t('channelHealth')}
                    </AcademyCard.Title>
                    <SystemStatus value={data.state} locale={locale} />
                  </div>
                  <AcademyCard.Description className="text-ink-muted">
                    {t('refreshing')}
                  </AcademyCard.Description>
                </AcademyCard.Header>
                <AcademyCard.Content className="grid gap-5 px-5 pb-5">
                  <p
                    className="rounded-xl border border-brand/20 bg-brand-soft p-4 text-sm leading-relaxed text-ink"
                    role="status"
                  >
                    {t(`channel${data.state}`)}
                  </p>
                  <dl className={styles.facts}>
                    {(
                      [
                        'enabled',
                        'otpAvailable',
                        'phoneMasked',
                        'lastConnectedAt',
                        'lastDisconnectedAt',
                        'lastHeartbeatAt',
                        'lastErrorCode',
                      ] as const
                    ).map((name) => (
                      <div key={name}>
                        <dt>{t(name)}</dt>
                        <dd>
                          <SystemValue name={name} value={data[name]} locale={locale} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {data.state !== 'CONNECTED' &&
                      data.state !== 'STARTING' &&
                      data.state !== 'QR_REQUIRED' ? (
                        <Button onClick={() => startCommand('connect')}>{t('connect')}</Button>
                      ) : null}
                      {data.enabled ? (
                        <Button variant="secondary" onClick={() => startCommand('disable')}>
                          {t('disable')}
                        </Button>
                      ) : null}
                      <Button variant="secondary" onClick={() => startCommand('reset')}>
                        {t('reset')}
                      </Button>
                      {data.needsQr ? (
                        <Button variant="secondary" onClick={() => setShowQr((old) => !old)}>
                          {t(showQr ? 'hideQr' : 'showQr')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {!canManage ? (
                    <p className="text-sm text-ink-muted">{t('channelReadOnly')}</p>
                  ) : null}
                </AcademyCard.Content>
              </AcademyCard>
              <AcademyCard className={styles.recordCard ?? ''} data-library-component="heroui/card">
                <AcademyCard.Header className="p-5 pb-0">
                  <AcademyCard.Title className="text-lg text-ink">
                    {t('channelGuide')}
                  </AcademyCard.Title>
                  <AcademyCard.Description className="text-ink-muted">
                    {t('channelSafety')}
                  </AcademyCard.Description>
                </AcademyCard.Header>
                <AcademyCard.Content className="grid gap-5 px-5 pb-5">
                  <ol className="grid list-decimal gap-4 ps-5 text-sm leading-relaxed text-ink">
                    {['connectGuide', 'qrInstructions', 'readyGuide'].map((key) => (
                      <li key={key}>{t(key)}</li>
                    ))}
                  </ol>
                  <p className="border-t border-border pt-4 text-sm leading-relaxed text-ink-muted">
                    {t('channelWarning')}
                  </p>
                </AcademyCard.Content>
              </AcademyCard>
            </div>
          ) : null}
        </div>
        {showQr && needsQr && canManage ? (
          <PairingCode
            key={data?.qrExpiresAt}
            locale={locale}
            onClose={() => setShowQr(false)}
            onReset={() => startCommand('reset')}
          />
        ) : null}
        {command ? (
          <ChannelDialog
            action={command.action}
            version={command.version}
            userId={user.id}
            locale={locale}
            onClose={() => setCommand(undefined)}
            onSaved={(result) => {
              setCommand(undefined);
              if (result && typeof result === 'object') {
                client.setQueryData([...systemKey(user.id), 'channel'], result);
              }
              if (command.action === 'reset') {
                setShowQr(true);
                void query.refetch();
              }
            }}
          />
        ) : null}
        <StepUpDialog
          open={stepUp}
          locale={locale}
          copy={copy}
          onClose={() => setStepUp(false)}
          onVerified={() => {
            setStepUp(false);
            void query.refetch();
          }}
        />
      </div>
    </div>
  );
}
