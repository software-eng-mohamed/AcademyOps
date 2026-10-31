'use client';

import { ArrowLeft2, SidebarRight } from 'iconsax-react';
import { field, record, textValue } from '@/api/academy/models';
import { managementKey } from '@/api/management/queries';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-detail-styles';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { isStepUpRequired, StepUpDialog } from '@/features/academy/step-up-dialog';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import { workflowText } from '@/i18n/workflow-copy';
import { AttendanceRecordPanel } from './attendance-record';
import { CertificateUploader } from './certificate-uploader';
import { detailColumns } from './config';
import { ContactsDialog } from './contacts-dialog';
import { FinancialEnrollment } from './financial-enrollment';
import { ManagementRelatedRecords } from './management-related-records';
import { PaymentApprovalRequests } from './payment-approval-requests';
import { ManagementAvatar, ManagementFacts, ManagementStatus } from './presentation';
import { useManagementDetailState } from './use-management-detail-state';

export function ManagementDetailFullPage(
  props: Parameters<typeof useManagementDetailState>[0] & { onSwitchToDrawer?: () => void },
) {
  const model = useManagementDetailState(props);
  const { onSwitchToDrawer } = props;
  const {
    resource,
    row,
    user,
    locale,
    onClose,
    onAction,
    copy,
    t,
    personal,
    stepUp,
    setStepUp,
    contactsOpen,
    setContactsOpen,
    client,
    query,
    detail,
    balance,
    download,
    upload,
    downloadable,
    actions,
    canOpenRoster,
    canOpenPayment,
    showActions,
  } = model;

  return (
    <article className={styles.fullPage} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className={styles.fullPageHeader}>
        <div className={styles.fullPageNav}>
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={onClose}
            className="flex items-center gap-2"
          >
            <ArrowLeft2 aria-hidden color="currentColor" className="size-4 rtl:rotate-180" />
            <span>{workflowText(locale, 'backToList')}</span>
          </Button>
          {onSwitchToDrawer ? (
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={onSwitchToDrawer}
              className="flex items-center gap-2"
              title={workflowText(locale, 'openDrawer')}
            >
              <SidebarRight aria-hidden size={16} color="currentColor" />
              <span>{workflowText(locale, 'openDrawer')}</span>
            </Button>
          ) : null}
        </div>
        <div className={styles.fullPageHeading}>
          <div className={styles.fullPageIdentity}>
            <ManagementAvatar row={detail ?? row} resource={resource} large />
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">
                {t(
                  ['sessions', 'roster', 'certificates'].includes(resource)
                    ? 'operations'
                    : 'financeGroup',
                )}{' '}
                / {t(resource)}
              </p>
              <h1 className={styles.fullPageTitle}>
                {resource === 'exports' ? t(detail?.name || row.name) : detail?.name || row.name}
              </h1>
              {detail?.status || row.status ? (
                <div className="mt-2">
                  <ManagementStatus value={detail?.status || row.status} locale={locale} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-6">
        {resource !== 'exports' && query.isPending ? (
          <p role="status" className="p-8 text-center text-sm text-text-secondary">
            {copy.loading}
          </p>
        ) : resource !== 'exports' && query.isError ? (
          <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
        ) : detail ? (
          <>
            <section className={styles.detailSection}>
              <h3>{copy.details}</h3>
              <ManagementFacts
                data={detail.data}
                names={
                  personal
                    ? detailColumns[resource].filter(
                        (name) => !['billingAccountId', 'enrollmentId', 'paymentId'].includes(name),
                      )
                    : detailColumns[resource]
                }
                locale={locale}
              />
            </section>

            {showActions ? (
              <section className={styles.detailSection}>
                <h3>{copy.actions}</h3>
                <div className={styles.inlineActions}>
                  {actions.map((action) => (
                    <Button
                      key={action}
                      variant="secondary"
                      onClick={() =>
                        onAction({
                          resource,
                          row: detail,
                          action,
                          ...(resource === 'roster'
                            ? { sessionId: textValue(field(detail.data, 'session.id')) }
                            : {}),
                        })
                      }
                    >
                      {t(action)}
                    </Button>
                  ))}
                  {canOpenRoster ? (
                    <ButtonLink
                      href={`/${locale}/attendance?sessionId=${encodeURIComponent(row.id)}`}
                      variant="secondary"
                    >
                      {t('openRoster')}
                    </ButtonLink>
                  ) : null}
                  {canOpenPayment ? (
                    <ButtonLink
                      href={`/${locale}/${personal ? 'finance?tab=payments&' : 'payments?'}record=${encodeURIComponent(textValue(detail.data.paymentId))}`}
                      variant="secondary"
                    >
                      {t('viewPayment')}
                    </ButtonLink>
                  ) : null}
                  {downloadable ? (
                    <Button
                      variant="secondary"
                      disabled={download.isPending}
                      onClick={() => download.mutate()}
                    >
                      {download.isPending ? copy.loading : t('download')}
                    </Button>
                  ) : null}
                  {download.data ? (
                    <a
                      href={download.data}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand"
                    >
                      {t('openDownload')}
                    </a>
                  ) : null}
                </div>
                {download.isError ? <ErrorNotice error={download.error} copy={copy} /> : null}
              </section>
            ) : null}

            <CertificateUploader model={model} />

            {resource === 'roster' ? (
              <AttendanceRecordPanel key={detail.id} row={detail} user={user} locale={locale} />
            ) : null}

            {resource === 'payments' || resource === 'aging' ? (
              <FinancialEnrollment
                enrollmentId={textValue(detail.data.enrollmentId)}
                user={user}
                locale={locale}
              />
            ) : null}

            {balance.data ? (
              <section className={styles.detailSection}>
                <h3>{t('financeSummary')}</h3>
                <ManagementFacts
                  data={record(balance.data.data)}
                  names={[
                    'balance',
                    'totalDebits',
                    'totalCredits',
                    'outstandingDebits',
                    'unappliedCredits',
                  ]}
                  locale={locale}
                />
              </section>
            ) : balance.isError ? (
              <ErrorNotice error={balance.error} copy={copy} retry={() => void balance.refetch()} />
            ) : null}

            <PaymentApprovalRequests model={model} />

            {resource === 'businessAccounts' && hasPermission(user, 'business_accounts.manage') ? (
              <div className="my-4">
                <Button variant="secondary" onClick={() => setContactsOpen(true)}>
                  {t('editContacts')}
                </Button>
              </div>
            ) : null}

            <ManagementRelatedRecords model={model} />
          </>
        ) : null}
      </div>

      {contactsOpen && detail ? (
        <ContactsDialog
          row={detail}
          locale={locale}
          userId={user.id}
          onClose={() => setContactsOpen(false)}
        />
      ) : null}
      {stepUp ? (
        <StepUpDialog
          open
          locale={locale}
          copy={copy}
          onClose={() => setStepUp(false)}
          onVerified={async () => {
            setStepUp(false);
            if (isStepUpRequired(upload.error)) upload.reset();
            if (isStepUpRequired(download.error)) download.reset();
            await client.invalidateQueries({ queryKey: managementKey(user.id) });
          }}
        />
      ) : null}
    </article>
  );
}
