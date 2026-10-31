'use client';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useAuthControllerRequestPasswordResetV1 } from '@/api/generated/identity/identity';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import type { Locale } from '@/lib/locales';
import { getPasswordRecoveryCopy } from './password-recovery-copy';
import {
  FIELD_CLASS_NAME,
  type RecoveryError,
  RecoveryErrorMessage,
  type RecoveryMethod,
  RecoveryShell,
  recoveryError,
} from './password-recovery-parts';
import {
  formatEgyptPhoneLocalInput,
  isValidEgyptPhoneLocalInput,
  normalizeEgyptPhoneLocalInput,
  toEgyptPhoneIdentifier,
} from './phone-identifier';
export function ForgotPasswordScreen({
  method,
  locale,
  organizationCode,
}: {
  method: RecoveryMethod;
  locale: Locale;
  organizationCode: string;
}) {
  const copy = getPasswordRecoveryCopy(locale);
  const [identifier, setIdentifier] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState<RecoveryError | null>(null);
  const [accepted, setAccepted] = useState(false);
  const mutation = useAuthControllerRequestPasswordResetV1({
    mutation: { retry: false },
    request: { allowUnauthorized: true },
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const normalized =
      method === 'EMAIL' ? identifier.trim().toLowerCase() : toEgyptPhoneIdentifier(identifier);
    const valid =
      method === 'EMAIL'
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
        : isValidEgyptPhoneLocalInput(identifier);
    if (!valid) {
      setFieldError(copy.invalidIdentifier);
      return;
    }
    setFieldError('');
    try {
      await mutation.mutateAsync({
        data: { identifier: normalized, identifierType: method, locale, organizationCode },
      });
      setAccepted(true);
    } catch (requestError) {
      setError(recoveryError(requestError, copy.genericError));
    }
  };

  if (accepted) {
    return (
      <RecoveryShell
        description={method === 'EMAIL' ? copy.acceptedEmail : copy.acceptedPhone}
        locale={locale}
        method={method}
        route="forgot-password"
        title={copy.acceptedTitle}
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <CheckCircle2 aria-hidden="true" className="size-10 text-accent-600" />
          <ButtonLink className="h-11 w-full rounded-lg" href={`/${locale}/login`}>
            {copy.backToLogin}
          </ButtonLink>
        </div>
      </RecoveryShell>
    );
  }

  return (
    <RecoveryShell
      description={method === 'EMAIL' ? copy.forgotEmailDescription : copy.forgotPhoneDescription}
      locale={locale}
      method={method}
      route="forgot-password"
      title={method === 'EMAIL' ? copy.forgotEmailTitle : copy.forgotPhoneTitle}
    >
      <form className="flex flex-col gap-5" noValidate onSubmit={submit}>
        <Input
          autoComplete={method === 'EMAIL' ? 'email' : 'tel'}
          fieldClassName={`${FIELD_CLASS_NAME} ${method === 'PHONE' ? '[direction:ltr]' : ''}`}
          hint={fieldError || undefined}
          inputMode={method === 'EMAIL' ? 'email' : 'tel'}
          inputClassName="[direction:ltr] text-left"
          isDisabled={mutation.isPending}
          isInvalid={Boolean(fieldError)}
          label={method === 'EMAIL' ? copy.email : copy.phone}
          leadingAddon={
            method === 'PHONE' ? (
              <span
                className="flex h-7 shrink-0 items-center border-e border-border-button-default px-2 text-body-medium text-text-secondary"
                dir="ltr"
              >
                +20
              </span>
            ) : null
          }
          onChange={(value) => {
            setIdentifier(method === 'PHONE' ? normalizeEgyptPhoneLocalInput(value) : value);
            setFieldError('');
            setError(null);
          }}
          placeholder={method === 'EMAIL' ? copy.emailPlaceholder : copy.phonePlaceholder}
          type={method === 'EMAIL' ? 'email' : 'tel'}
          value={method === 'PHONE' ? formatEgyptPhoneLocalInput(identifier) : identifier}
        />
        <RecoveryErrorMessage copy={copy} error={error} />
        <Button
          className="h-11 w-full rounded-lg text-white"
          disabled={mutation.isPending}
          type="submit"
        >
          {mutation.isPending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {mutation.isPending
            ? copy.sending
            : method === 'EMAIL'
              ? copy.sendEmailLink
              : copy.sendPhoneLink}
        </Button>
        <ButtonLink
          className="h-auto self-center !bg-transparent px-0 py-0 hover:!bg-transparent active:!bg-transparent"
          href={`/${locale}/login`}
          size="xs"
          variant="ghost"
        >
          {copy.backToLogin}
        </ButtonLink>
      </form>
    </RecoveryShell>
  );
}
