'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useAuthControllerCompletePasswordResetV1 } from '@/api/generated/identity/identity';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import type { Locale } from '@/lib/locales';
import { PasswordInput } from './login-form-parts';
import { getPasswordRecoveryCopy } from './password-recovery-copy';
import {
  FIELD_CLASS_NAME,
  passwordResetError,
  type RecoveryError,
  RecoveryErrorMessage,
  RecoveryShell,
} from './password-recovery-parts';
import { createPasswordResetSchema, type PasswordResetFormValues } from './password-reset-schema';
export function ResetPasswordScreen({ locale }: { locale: Locale }) {
  const copy = getPasswordRecoveryCopy(locale);
  const schema = useMemo(() => createPasswordResetSchema(copy), [copy]);
  const [credentials, setCredentials] = useState<{
    organizationCode: string;
    token: string;
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<RecoveryError | null>(null);
  const [complete, setComplete] = useState(false);
  const mutation = useAuthControllerCompletePasswordResetV1({
    mutation: { retry: false },
    request: { allowUnauthorized: true },
  });
  const form = useForm<PasswordResetFormValues>({
    defaultValues: { confirmation: '', password: '' },
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const organizationCode = hash.get('organizationCode')?.trim().toUpperCase() ?? '';
    const token = hash.get('token') ?? '';
    setCredentials(
      /^[A-Z0-9_-]{1,50}$/.test(organizationCode) && token.length >= 32
        ? { organizationCode, token }
        : null,
    );
  }, []);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    if (!credentials) {
      setError({ message: copy.invalidLink });
      return;
    }
    try {
      await mutation.mutateAsync({
        data: { ...credentials, newPassword: values.password },
      });
      setComplete(true);
    } catch (requestError) {
      setError(passwordResetError(requestError, copy));
    }
  });

  if (complete) {
    return (
      <RecoveryShell
        description={copy.resetSuccess}
        locale={locale}
        route="reset-password"
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
      description={copy.resetDescription}
      locale={locale}
      preserveHash
      route="reset-password"
      title={copy.resetTitle}
    >
      <form className="flex flex-col gap-5" noValidate onSubmit={submit}>
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <PasswordInput
              {...field}
              autoComplete="new-password"
              fieldClassName={FIELD_CLASS_NAME}
              hidePasswordLabel={copy.hidePassword}
              hint={fieldState.error?.message ?? copy.passwordHint}
              isDisabled={mutation.isPending}
              isInvalid={Boolean(fieldState.error)}
              isPasswordVisible={showPassword}
              label={copy.newPassword}
              onChange={(value) => {
                field.onChange(value);
                setError(null);
              }}
              onPasswordVisibilityChange={setShowPassword}
              placeholder={copy.newPasswordPlaceholder}
              showPasswordLabel={copy.showPassword}
            />
          )}
        />
        <Controller
          control={form.control}
          name="confirmation"
          render={({ field, fieldState }) => (
            <PasswordInput
              {...field}
              autoComplete="new-password"
              fieldClassName={FIELD_CLASS_NAME}
              hidePasswordLabel={copy.hidePassword}
              hint={fieldState.error?.message}
              isDisabled={mutation.isPending}
              isInvalid={Boolean(fieldState.error)}
              isPasswordVisible={showConfirmation}
              label={copy.confirmPassword}
              onChange={(value) => {
                field.onChange(value);
                setError(null);
              }}
              onPasswordVisibilityChange={setShowConfirmation}
              placeholder={copy.confirmPasswordPlaceholder}
              showPasswordLabel={copy.showPassword}
            />
          )}
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
          {mutation.isPending ? copy.resetting : copy.resetPassword}
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
