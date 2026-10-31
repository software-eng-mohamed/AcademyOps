import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { Input } from '@/components/base/input/input';
import { InputOtp } from '@/components/base/input-otp/input-otp';
import { formatOtpDigitLabel } from './login-copy';
import { LOGIN_FIELD_CLASS_NAME } from './login-field-styles';
import { FieldMessage, FormError, MethodSelector } from './login-form-parts';
import type { LoginFormModel } from './use-login-form';
export function LoginPhoneOtpStep({ model }: { model: LoginFormModel }) {
  const {
    copy,
    setStep,
    phoneCode,
    setPhoneCode,
    phoneCodeInvalid,
    setPhoneCodeInvalid,
    requestedPhone,
    phoneResendSeconds,
    formError,
    setFormError,
    cooldownSeconds,
    loginCompleting,
    phoneOtpRef,
    phoneRequestMutation,
    phoneVerifyMutation,
    form,
    onStepChange,
    resendPhoneCode,
    verifyPhoneCode,
  } = model;
  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={verifyPhoneCode} ref={phoneOtpRef}>
      <div className="flex flex-col">
        <span className="mb-3 block text-body-medium text-text-primary">{copy.phoneCodeLabel}</span>
        <InputOtp
          aria-label={copy.phoneCodeLabel}
          className="gap-2 [&_input]:size-10 sm:[&_input]:size-12"
          digitLabel={(index, length) => formatOtpDigitLabel(copy, index, length)}
          isDisabled={phoneVerifyMutation.isPending || loginCompleting}
          isInvalid={phoneCodeInvalid}
          onChange={(value) => {
            setPhoneCode(value);
            if (phoneCodeInvalid) setPhoneCodeInvalid(false);
            if (formError) setFormError(null);
          }}
          value={phoneCode}
        />
        <div className="mt-3">
          <FieldMessage
            invalid={phoneCodeInvalid}
            text={phoneCodeInvalid ? copy.errorPhoneOtpInvalid : copy.phoneCodeHint}
          />
        </div>
      </div>
      <p className="text-center text-caption-1-medium text-text-secondary" dir="ltr">
        {requestedPhone}
      </p>
      <FormError copy={copy} cooldownSeconds={cooldownSeconds} error={formError} />
      <Button
        className="h-11 w-full rounded-lg text-white"
        disabled={phoneVerifyMutation.isPending || loginCompleting || cooldownSeconds > 0}
        type="submit"
      >
        {phoneVerifyMutation.isPending || loginCompleting ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {phoneVerifyMutation.isPending || loginCompleting ? copy.verifying : copy.verifyPhoneCode}
      </Button>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <LinkButton
          disabled={phoneRequestMutation.isPending || phoneResendSeconds > 0}
          onClick={() => void resendPhoneCode()}
        >
          {phoneResendSeconds > 0
            ? `${copy.resendPhoneCodeIn} ${phoneResendSeconds}${copy.secondsShort}`
            : copy.resendPhoneCode}
        </LinkButton>
        <LinkButton
          disabled={phoneRequestMutation.isPending || phoneVerifyMutation.isPending}
          onClick={() => {
            form.setValue('identifierType', 'PHONE', { shouldDirty: true });
            form.setValue('identifier', '', { shouldDirty: true });
            form.clearErrors('identifier');
            setStep('changePhone');
            onStepChange?.('changePhone');
            setPhoneCode('');
            setPhoneCodeInvalid(false);
            setFormError(null);
            window.requestAnimationFrame(() => form.setFocus('identifier'));
          }}
          variant="secondary"
        >
          {copy.changePhone}
        </LinkButton>
      </div>
    </form>
  );
}
export function LoginMfaStep({ model }: { model: LoginFormModel }) {
  const {
    copy,
    setStep,
    authFlow,
    mfaMethod,
    setMfaMethod,
    mfaCode,
    setMfaCode,
    mfaInvalid,
    setMfaInvalid,
    formError,
    setFormError,
    cooldownSeconds,
    loginCompleting,
    mfaRef,
    passwordMutation,
    phoneVerifyMutation,
    onStepChange,
    submitMfa,
  } = model;
  const mfaPending = passwordMutation.isPending || phoneVerifyMutation.isPending || loginCompleting;
  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={submitMfa} ref={mfaRef}>
      <MethodSelector
        label={copy.mfaMethod}
        options={[
          { label: copy.totp, value: 'totp' },
          { label: copy.recovery, value: 'recovery' },
        ]}
        onChange={(method) => {
          setMfaMethod(method);
          setMfaCode('');
          setMfaInvalid(false);
          setFormError(null);
        }}
        value={mfaMethod}
      />
      <div data-login-mfa-method-content>
        {mfaMethod === 'totp' ? (
          <div className="grid gap-2.5">
            <span className="block text-body-medium text-text-primary" data-login-mfa-code-label>
              {copy.code}
            </span>
            <InputOtp
              aria-label={copy.code}
              digitLabel={(index, length) => formatOtpDigitLabel(copy, index, length)}
              isDisabled={mfaPending}
              isInvalid={mfaInvalid}
              onChange={setMfaCode}
              value={mfaCode}
            />
            <div data-login-mfa-code-hint>
              <FieldMessage
                invalid={mfaInvalid}
                text={mfaInvalid ? copy.errorMfa : copy.codeHint}
              />
            </div>
          </div>
        ) : (
          <Input
            autoComplete="one-time-code"
            fieldClassName={LOGIN_FIELD_CLASS_NAME}
            hint={mfaInvalid ? copy.errorMfa : copy.recoveryHint}
            isDisabled={mfaPending}
            isInvalid={mfaInvalid}
            label={copy.recovery}
            onChange={setMfaCode}
            placeholder={copy.recoveryPlaceholder}
            value={mfaCode}
          />
        )}
      </div>
      <FormError copy={copy} cooldownSeconds={cooldownSeconds} error={formError} />
      <Button
        className="h-11 w-full rounded-lg text-white"
        disabled={mfaPending || cooldownSeconds > 0}
        type="submit"
      >
        {mfaPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
        {mfaPending ? copy.verifying : copy.verify}
      </Button>
      <LinkButton
        className="self-center"
        disabled={mfaPending}
        onClick={() => {
          const previousStep = authFlow === 'phoneOtp' ? 'phoneOtp' : 'credentials';
          setStep(previousStep);
          onStepChange?.(previousStep);
          setMfaCode('');
          setFormError(null);
        }}
      >
        {copy.back}
      </LinkButton>
    </form>
  );
}
