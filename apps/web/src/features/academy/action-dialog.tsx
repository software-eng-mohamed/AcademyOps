'use client';
import {
  Checkbox,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
} from '@academyops/ui';
import { Button } from '@/components/base/buttons/button';
import { academyLabel } from '@/i18n/academy-copy';
import { AcademyActionFields } from './academy-action-fields';
import { AcademyContactsEditor } from './academy-contacts-editor';
import { AcademyCurriculumEditor } from './academy-curriculum-editor';
import styles from './academy-form-styles';
import { AcademyIdentityReview } from './academy-identity-review';
import { AcademyFormHeading } from './academy-surfaces';
import { ErrorNotice } from './academy-ui';
import { StepUpDialog } from './step-up-dialog';
import { useAcademyAction } from './use-academy-action';
export function ActionDialog(props: Parameters<typeof useAcademyAction>[0]) {
  const model = useAcademyAction(props);
  const {
    target,
    locale,
    copy,
    onClose,
    formId,
    errors,
    formRef,
    confirmed,
    setConfirmed,
    stepUpOpen,
    setStepUpOpen,
    mutation,
    submit,
    notice,
  } = model;
  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open && !mutation.isPending && !stepUpOpen) onClose();
        }}
      >
        <ModalContent className={styles.modal} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <ModalHeader>
            <div>
              <AcademyFormHeading>
                {target.action === 'create'
                  ? academyLabel(copy, `add_${target.resource}`)
                  : `${target.resource === 'cohorts' && target.action === 'plan' ? copy.openIntake : target.resource === 'cohorts' && target.action === 'activate' ? copy.startCohort : academyLabel(copy, target.action)} · ${academyLabel(copy, target.resource)}`}
              </AcademyFormHeading>
              <ModalDescription className="mt-2 text-sm text-text-secondary">
                {target.resource === 'cohorts' &&
                ['create', 'edit', 'plan', 'activate'].includes(target.action)
                  ? target.action === 'activate'
                    ? copy.cohortStartHint
                    : copy.cohortCollectionHint
                  : notice}
              </ModalDescription>
            </div>
            <ModalCloseButton aria-label={copy.close} disabled={mutation.isPending} />
          </ModalHeader>
          <ModalBody>
            <form ref={formRef} id={formId} onSubmit={submit} noValidate className={styles.form}>
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
              <AcademyActionFields model={model} />
              <AcademyIdentityReview model={model} />
              <AcademyCurriculumEditor model={model} />
              <AcademyContactsEditor model={model} />
              {target.action === 'merge' ? (
                <Checkbox
                  label={copy.confirmMerge}
                  checked={confirmed}
                  disabled={mutation.isPending}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
              ) : null}
            </form>
          </ModalBody>
          <ModalFooter className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              className="min-w-20"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              {copy.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="min-w-24"
              form={formId}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? copy.saving
                : target.action === 'create'
                  ? copy.create
                  : target.action === 'edit' || target.action === 'editContacts'
                    ? copy.save
                    : copy.confirmation}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <StepUpDialog
        open={stepUpOpen}
        locale={locale}
        copy={copy}
        onClose={() => setStepUpOpen(false)}
        onVerified={() => {
          setStepUpOpen(false);
          mutation.reset();
        }}
      />
    </>
  );
}
