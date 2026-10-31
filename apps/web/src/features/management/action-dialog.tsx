'use client';

import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
} from '@academyops/ui';
import { textValue } from '@/api/academy/models';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-form-styles';
import { AcademyFormHeading } from '@/features/academy/academy-surfaces';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { StepUpDialog } from '@/features/academy/step-up-dialog';
import { actionFields, validateManagementFields } from './actions';
import { CheckoutResult } from './checkout-result';
import { InvoiceLinesEditor } from './invoice-lines';
import { ManagementActionFields } from './management-action-fields';

import { ManagementFacts } from './presentation';
import { SessionTrainersEditor } from './session-trainers';
import { useManagementActionState } from './use-management-action-state';
export function ManagementActionDialog(props: Parameters<typeof useManagementActionState>[0]) {
  const model = useManagementActionState(props);
  const {
    target,
    userId,
    locale,
    copy,
    t,
    values,
    errors,
    setErrors,
    formRef,
    focusValidation,
    stepUp,
    setStepUp,
    id,
    context,
    mutation,
    change,
    close,
    result,
    fields,
  } = model;
  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open && !stepUp) close();
        }}
      >
        <ModalContent className={styles.modal} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <ModalHeader>
            <div>
              <AcademyFormHeading>{t(target.action)}</AcademyFormHeading>
              <ModalDescription className="mt-2 text-sm text-text-secondary">
                {target.row?.name || (fields.length ? copy.formHelp : t('confirmDescription'))}
              </ModalDescription>
            </div>
            <ModalCloseButton aria-label={copy.close} disabled={mutation.isPending} />
          </ModalHeader>
          <ModalBody>
            {mutation.isSuccess ? (
              <div className="space-y-4" role="status">
                <p className="font-semibold text-success">{t('saved')}</p>
                {target.action === 'createCheckout' ? (
                  <CheckoutResult result={result} userId={userId} locale={locale} />
                ) : target.action === 'evaluateCertificate' ? (
                  <ManagementFacts
                    data={result}
                    names={[
                      'academicResult',
                      'attendanceRatio',
                      'minimumRatio',
                      'financialHold',
                      'outstanding',
                      'completionSatisfied',
                    ]}
                    locale={locale}
                  />
                ) : (
                  <p className="break-all text-sm text-ink-muted">
                    {t('name')}: {textValue(result.id)}
                    {target.action === 'requestRefund' ? ` — ${t('makerChecker')}` : ''}
                  </p>
                )}
              </div>
            ) : (
              <form
                ref={formRef}
                id={id}
                noValidate
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (mutation.isPending) return;
                  const nextErrors = validateManagementFields(target.action, values);
                  focusValidation.current = Object.keys(nextErrors).length > 0;
                  setErrors(
                    Object.fromEntries(
                      Object.entries(nextErrors).map(([key, message]) => [
                        key,
                        message === 'required' ? copy.required : t(message),
                      ]),
                    ),
                  );
                  if (!Object.keys(nextErrors).length) mutation.mutate();
                }}
              >
                {target.action === 'createCheckout' && target.row ? (
                  <div className="grid gap-3">
                    <p className="text-sm text-ink-muted">{t('checkoutHint')}</p>
                    <ManagementFacts
                      data={target.row.data}
                      names={['dueDate', 'outstanding']}
                      locale={locale}
                    />
                  </div>
                ) : null}
                {mutation.isError ? <ErrorNotice error={mutation.error} copy={copy} /> : null}
                {Object.values(errors).some(Boolean) ? (
                  <p
                    role="alert"
                    tabIndex={-1}
                    data-validation-summary
                    className={styles.validationSummary}
                  >
                    {copy.invalid}
                  </p>
                ) : null}
                <fieldset
                  disabled={mutation.isPending}
                  className={styles.formFields}
                  data-columns={fields.length >= 4 ? 2 : 1}
                >
                  <ManagementActionFields model={model} />
                </fieldset>
                {target.action === 'createInvoice' ? (
                  <fieldset disabled={mutation.isPending} className="min-w-0">
                    <InvoiceLinesEditor
                      values={values}
                      onChange={(value) => change('invoiceLines', value)}
                      userId={userId}
                      locale={locale}
                      {...(errors.invoiceLines ? { error: errors.invoiceLines } : {})}
                    />
                  </fieldset>
                ) : null}
                {['createSession', 'reschedule'].includes(target.action) ? (
                  <fieldset disabled={mutation.isPending} className="min-w-0">
                    <SessionTrainersEditor
                      value={values.trainers ?? '[]'}
                      onChange={(value) => change('trainers', value)}
                      userId={userId}
                      locale={locale}
                      {...(errors.trainers ? { error: errors.trainers } : {})}
                    />
                  </fieldset>
                ) : null}
                {target.action === 'closeWindow' ? (
                  <p className="my-3 text-sm text-ink-muted">{t('closeWindowHint')}</p>
                ) : null}
                {!actionFields(target.action, values).length ? (
                  <p className="my-3 text-sm text-ink-muted">{t('confirmDescription')}</p>
                ) : null}
                {target.action === 'createAccount' && !context.data?.branches[0]?.id ? (
                  <p className="my-3 text-sm text-ink-muted">
                    {context.isPending ? copy.loading : copy.noBranch}
                  </p>
                ) : null}
                {context.isError ? (
                  <ErrorNotice
                    error={context.error}
                    copy={copy}
                    retry={() => void context.refetch()}
                  />
                ) : null}
              </form>
            )}
          </ModalBody>
          <ModalFooter className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              className="min-w-20"
              onClick={close}
              disabled={mutation.isPending}
            >
              {mutation.isSuccess ? copy.close : copy.cancel}
            </Button>
            {!mutation.isSuccess ? (
              <Button
                type="submit"
                variant="primary"
                className="min-w-24"
                form={id}
                disabled={
                  mutation.isPending ||
                  (target.action === 'createAccount' && !context.data?.branches[0]?.id)
                }
              >
                {mutation.isPending
                  ? copy.saving
                  : target.action.startsWith('create')
                    ? copy.create
                    : ['editAccount', 'reschedule'].includes(target.action)
                      ? copy.save
                      : copy.confirmation}
              </Button>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>
      {stepUp ? (
        <StepUpDialog
          open
          locale={locale}
          copy={copy}
          onClose={() => setStepUp(false)}
          onVerified={() => {
            setStepUp(false);
            mutation.reset();
            if (target.action === 'createAccount') void context.refetch();
          }}
        />
      ) : null}
    </>
  );
}
