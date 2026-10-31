'use client';

import { isPlgApiError } from '@academyops/api-client/http';
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@academyops/ui';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { mfaControllerStepUpV1 } from '@/api/generated/identity/identity';
import { Button } from '@/components/base/buttons/button';
import { InputOtp } from '@/components/base/input-otp/input-otp';
import type { AcademyCopy } from '@/i18n/academy-copy';
import type { Locale } from '@/lib/locales';
import styles from './academy-form-styles';
import { ErrorNotice } from './academy-ui';

export function isStepUpRequired(error: unknown): boolean {
  return isPlgApiError(error) && error.payload.code === 'MFA_STEP_UP_REQUIRED';
}

export function StepUpDialog({
  open,
  locale,
  copy,
  onClose,
  onVerified,
}: {
  open: boolean;
  locale: Locale;
  copy: AcademyCopy;
  onClose: () => void;
  onVerified: () => void | Promise<void>;
}) {
  const formId = useId();
  const [code, setCode] = useState('');
  const mutation = useMutation({
    mutationFn: () => mfaControllerStepUpV1({ code }),
    retry: false,
    onSuccess: async () => {
      await onVerified();
      setCode('');
    },
  });
  const invalid =
    isPlgApiError(mutation.error) && mutation.error.payload.code === 'MFA_CODE_INVALID';
  const close = () => {
    if (mutation.isPending) return;
    setCode('');
    mutation.reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <ModalContent className={styles.modal} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <ModalHeader>
          <div>
            <ModalTitle>{copy.stepUpTitle}</ModalTitle>
            <ModalDescription className="mt-2">{copy.stepUpDescription}</ModalDescription>
          </div>
          <ModalCloseButton aria-label={copy.close} disabled={mutation.isPending} />
        </ModalHeader>
        <ModalBody>
          <form
            id={formId}
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!mutation.isPending && /^\d{6}$/.test(code)) mutation.mutate();
            }}
          >
            <span className="text-sm font-semibold text-text-primary">{copy.verificationCode}</span>
            <InputOtp
              aria-label={copy.verificationCode}
              digitLabel={(index, length) =>
                copy.otpDigit
                  .replace('{index}', String(index + 1))
                  .replace('{length}', String(length))
              }
              value={code}
              onChange={(value) => {
                setCode(value);
                if (mutation.isError) mutation.reset();
              }}
              onComplete={(value) => setCode(value)}
              isDisabled={mutation.isPending}
              isInvalid={invalid}
              groupEvery={3}
            />
            <p className="text-sm text-text-secondary">
              {invalid ? copy.mfaInvalid : copy.verificationHint}
            </p>
            {mutation.isError && !invalid ? (
              <ErrorNotice error={mutation.error} copy={copy} />
            ) : null}
          </form>
        </ModalBody>
        <ModalFooter className="flex justify-end gap-3">
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
            form={formId}
            disabled={mutation.isPending || !/^\d{6}$/.test(code)}
          >
            {mutation.isPending ? copy.verifying : copy.verify}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
