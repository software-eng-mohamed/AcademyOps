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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { systemKey } from '@/api/system/queries';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-styles';
import { AcademyFormHeading } from '@/features/academy/academy-surfaces';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { isStepUpRequired, StepUpDialog } from '@/features/academy/step-up-dialog';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';

export function SystemCommandDialog({
  title,
  description,
  locale,
  userId,
  fingerprint,
  submit,
  validate,
  children,
  onClose,
  onSaved,
  submitLabel,
}: {
  title: string;
  description: string;
  locale: Locale;
  userId: string;
  fingerprint: string;
  submit: (key: string) => Promise<unknown>;
  validate?: () => boolean;
  children?: ReactNode;
  onClose: () => void;
  onSaved?: (result: unknown) => void | Promise<void>;
  submitLabel?: string;
}) {
  const copy = getAcademyCopy(locale);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [stepUp, setStepUp] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  const submitting = useRef(false);
  const client = useQueryClient();
  const mutation = useMutation({
    retry: false,
    mutationFn: () => {
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, key: crypto.randomUUID() };
      return submit(attempt.current.key);
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: systemKey(userId) });
      await onSaved?.(result);
      onClose();
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  useEffect(() => {
    if (isStepUpRequired(mutation.error)) setStepUp(true);
  }, [mutation.error]);
  const close = () => {
    if (!mutation.isPending && !stepUp) onClose();
  };
  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <ModalContent className={styles.modal} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <ModalHeader>
            <div>
              <AcademyFormHeading>{title}</AcademyFormHeading>
              <ModalDescription className="mt-2 leading-relaxed">{description}</ModalDescription>
            </div>
            <ModalCloseButton disabled={mutation.isPending} aria-label={copy.close} />
          </ModalHeader>
          <ModalBody>
            <form
              ref={form}
              id={id}
              noValidate
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                if (submitting.current || mutation.isPending) return;
                if (validate && !validate()) {
                  setInvalid(true);
                  requestAnimationFrame(() =>
                    form.current
                      ?.querySelector<HTMLElement>(
                        '[aria-invalid="true"], [data-validation-summary]',
                      )
                      ?.focus(),
                  );
                  return;
                }
                setInvalid(false);
                submitting.current = true;
                mutation.mutate();
              }}
            >
              <fieldset disabled={mutation.isPending} className="grid min-w-0 gap-5 border-0 p-0">
                {children}
              </fieldset>
              {invalid ? (
                <p
                  role="alert"
                  tabIndex={-1}
                  data-validation-summary
                  className="text-sm text-danger"
                >
                  {systemText(locale, 'invalid')}
                </p>
              ) : null}
              {mutation.isError ? <ErrorNotice error={mutation.error} copy={copy} /> : null}
            </form>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              className="min-w-20"
              disabled={mutation.isPending}
              onClick={close}
            >
              {copy.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="min-w-24"
              form={id}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? copy.saving : (submitLabel ?? copy.save)}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <StepUpDialog
        open={stepUp}
        locale={locale}
        copy={copy}
        onClose={() => setStepUp(false)}
        onVerified={() => {
          setStepUp(false);
          mutation.reset();
        }}
      />
    </>
  );
}
