'use client';

import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@academyops/ui';
import { Maximize4 } from 'iconsax-react';
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
export function ManagementDetail(
  props: Parameters<typeof useManagementDetailState>[0] & { onExpandToPage?: () => void },
) {
  const model = useManagementDetailState(props);
  const { onExpandToPage } = props;
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
    <>
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open && !stepUp && !contactsOpen && !upload.isPending) onClose();
        }}
      >
        <DrawerContent className={styles.drawer} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <DrawerHeader>
            <div className="min-w-0">
              <DrawerDescription className="mb-2 text-xs text-text-secondary">
                {t(
                  ['sessions', 'roster', 'certificates'].includes(resource)
                    ? 'operations'
                    : 'financeGroup',
                )}{' '}
                / {t(resource)}
              </DrawerDescription>
              <div className={styles.detailHeading}>
                <ManagementAvatar row={detail ?? row} resource={resource} />
                <div>
                  <DrawerTitle className={styles.drawerTitle}>
                    {resource === 'exports'
                      ? t(detail?.name || row.name)
                      : detail?.name || row.name}
                  </DrawerTitle>
                  {detail?.status || row.status ? (
                    <div className="mt-2">
                      <ManagementStatus value={detail?.status || row.status} locale={locale} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onExpandToPage ? (
                <button
                  type="button"
                  onClick={onExpandToPage}
                  title={workflowText(locale, 'openFullPage')}
                  aria-label={workflowText(locale, 'openFullPage')}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-secondary bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:bg-background-secondary-default hover:text-text-primary transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  <Maximize4 aria-hidden size={16} color="currentColor" />
                </button>
              ) : null}
              <DrawerCloseButton aria-label={copy.close} />
            </div>
          </DrawerHeader>
          <DrawerBody>
            {resource !== 'exports' && query.isPending ? (
              <p role="status" className="p-4">
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
                            (name) =>
                              !['billingAccountId', 'enrollmentId', 'paymentId'].includes(name),
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
                  <ErrorNotice
                    error={balance.error}
                    copy={copy}
                    retry={() => void balance.refetch()}
                  />
                ) : null}
                <PaymentApprovalRequests model={model} />
                {resource === 'businessAccounts' &&
                hasPermission(user, 'business_accounts.manage') ? (
                  <div className="my-4">
                    <Button variant="secondary" onClick={() => setContactsOpen(true)}>
                      {t('editContacts')}
                    </Button>
                  </div>
                ) : null}
                <ManagementRelatedRecords model={model} />
              </>
            ) : null}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
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
    </>
  );
}
