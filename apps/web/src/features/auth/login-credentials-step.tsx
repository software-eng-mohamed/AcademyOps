import { LoaderCircle } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { LOGIN_FIELD_CLASS_NAME, PHONE_LOGIN_FIELD_CLASS_NAME } from './login-field-styles';
import { FormError, MethodSelector, PasswordInput } from './login-form-parts';
import { formatEgyptPhoneLocalInput, normalizeEgyptPhoneLocalInput } from './phone-identifier';
import { writeRememberedLogin } from './remembered-login';
import type { LoginFormModel } from './use-login-form';
export function LoginCredentialsStep({ model }: { model: LoginFormModel }) {
  const {
    copy,
    step,
    setStep,
    setPhoneCode,
    setPhoneCodeInvalid,
    setRequestedPhone,
    showPassword,
    setShowPassword,
    rememberMe,
    setRememberMe,
    formError,
    setFormError,
    cooldownSeconds,
    loginCompleting,
    credentialsRef,
    userInitiatedIdentifierChangeRef,
    phoneLoginPasswordRef,
    passwordMutation,
    phoneRequestMutation,
    form,
    identifierType,
    locale,
    onStepChange,
    submitCredentials,
  } = model;
  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={submitCredentials}
      ref={credentialsRef}
    >
      {step === 'credentials' ? (
        <MethodSelector
          label={copy.loginMethod}
          options={[
            { label: copy.email, value: 'EMAIL' },
            { label: copy.phone, value: 'PHONE' },
          ]}
          onChange={(value) => {
            if (value === identifierType) return;
            userInitiatedIdentifierChangeRef.current = true;
            form.setValue('identifierType', value, { shouldDirty: true, shouldValidate: true });
            form.setValue('identifier', '', { shouldDirty: true });
            form.clearErrors('identifier');
            setFormError(null);
            window.requestAnimationFrame(() => form.setFocus('identifier'));
          }}
          value={identifierType}
        />
      ) : null}
      <div className="w-full" data-login-identifier-field>
        <Controller
          control={form.control}
          name="identifier"
          render={({ field, fieldState }) => (
            <Input
              {...field}
              autoComplete={identifierType === 'EMAIL' ? 'email' : 'tel'}
              fieldClassName={
                identifierType === 'PHONE' ? PHONE_LOGIN_FIELD_CLASS_NAME : LOGIN_FIELD_CLASS_NAME
              }
              inputMode={identifierType === 'EMAIL' ? 'email' : 'tel'}
              inputClassName="[direction:ltr] text-left"
              isDisabled={
                passwordMutation.isPending || phoneRequestMutation.isPending || loginCompleting
              }
              isInvalid={Boolean(fieldState.error)}
              hint={fieldState.error?.message}
              label={identifierType === 'EMAIL' ? copy.email : copy.phone}
              leadingAddon={
                identifierType === 'PHONE' ? (
                  <span
                    className="flex h-7 shrink-0 items-center border-e border-border-button-default px-2 text-body-medium text-text-secondary"
                    dir="ltr"
                  >
                    +20
                  </span>
                ) : null
              }
              maxLength={identifierType === 'PHONE' ? 24 : 320}
              onChange={
                identifierType === 'PHONE'
                  ? (value) => field.onChange(normalizeEgyptPhoneLocalInput(value))
                  : field.onChange
              }
              placeholder={
                identifierType === 'EMAIL' ? copy.emailPlaceholder : copy.phonePlaceholder
              }
              type={identifierType === 'EMAIL' ? 'email' : 'tel'}
              value={
                identifierType === 'PHONE' ? formatEgyptPhoneLocalInput(field.value) : field.value
              }
            />
          )}
        />
      </div>
      <Controller
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <PasswordInput
            {...field}
            autoComplete="current-password"
            fieldClassName={LOGIN_FIELD_CLASS_NAME}
            hidePasswordLabel={copy.hidePassword}
            isDisabled={
              passwordMutation.isPending || phoneRequestMutation.isPending || loginCompleting
            }
            isInvalid={Boolean(fieldState.error)}
            isPasswordVisible={showPassword}
            hint={fieldState.error?.message}
            label={copy.password}
            onPasswordVisibilityChange={setShowPassword}
            placeholder={copy.passwordPlaceholder}
            showPasswordLabel={copy.showPassword}
          />
        )}
      />
      <div className="flex min-h-6 items-center justify-between gap-4">
        <Checkbox
          isDisabled={
            passwordMutation.isPending || phoneRequestMutation.isPending || loginCompleting
          }
          isSelected={rememberMe}
          onChange={(selected) => {
            setRememberMe(selected);
            if (!selected) writeRememberedLogin(null);
          }}
          size="sm"
        >
          {copy.rememberMe}
        </Checkbox>
        <ButtonLink
          className="h-auto !bg-transparent px-0 py-0 text-caption-1-semibold hover:!bg-transparent active:!bg-transparent"
          href={`/${locale}/forgot-password?method=${identifierType === 'PHONE' ? 'phone' : 'email'}`}
          size="xs"
          variant="ghost"
        >
          {copy.forgotPassword}
        </ButtonLink>
      </div>
      <FormError copy={copy} cooldownSeconds={cooldownSeconds} error={formError} />
      <Button
        className="h-11 w-full rounded-lg text-white"
        disabled={
          passwordMutation.isPending ||
          phoneRequestMutation.isPending ||
          loginCompleting ||
          cooldownSeconds > 0
        }
        type="submit"
      >
        {passwordMutation.isPending || phoneRequestMutation.isPending || loginCompleting ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {passwordMutation.isPending || phoneRequestMutation.isPending || loginCompleting
          ? copy.submitting
          : copy.submit}
      </Button>
      {step === 'changePhone' ? (
        <LinkButton
          className="self-center"
          disabled={phoneRequestMutation.isPending}
          onClick={() => {
            form.setValue('identifierType', 'PHONE');
            form.setValue('identifier', '');
            form.clearErrors();
            phoneLoginPasswordRef.current = '';
            setRequestedPhone('');
            setPhoneCode('');
            setPhoneCodeInvalid(false);
            setStep('credentials');
            onStepChange?.('credentials');
            setFormError(null);
            window.requestAnimationFrame(() => form.setFocus('identifier'));
          }}
        >
          {copy.back}
        </LinkButton>
      ) : null}
    </form>
  );
}
