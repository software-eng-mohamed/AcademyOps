import { isPlgApiError } from '@academyops/api-client/http';
import type { FormEvent } from 'react';
import type { LoginDto } from '@/api/generated/models/loginDto';
import type { LoginResponseDto } from '@/api/generated/models/loginResponseDto';
import { resetDashboardInitialLoader } from '@/features/dashboard/initial-loader-preference';
import type { Locale } from '@/lib/locales';
import { loginErrorView } from './login-error';
import type { LoginFormValues } from './login-schema';
import { toEgyptPhoneIdentifier } from './phone-identifier';
import { writeRememberedLogin } from './remembered-login';
import type { LoginFormState } from './use-login-form-state';

function loginDestination(
  locale: Locale,
  response: { mfaSetupRequired: boolean; passwordChangeRequired: boolean },
) {
  const search = new URLSearchParams();
  if (response.passwordChangeRequired) search.set('requiredAction', 'password-change');
  else if (response.mfaSetupRequired) search.set('requiredAction', 'mfa-setup');
  const query = search.toString();
  return `/${locale}/dashboard${query ? `?${query}` : ''}`;
}

export function loginFormActions(state: LoginFormState) {
  const {
    copy,
    router,
    setStep,
    authFlow,
    setAuthFlow,
    mfaMethod,
    mfaCode,
    setMfaCode,
    setMfaInvalid,
    phoneCode,
    setPhoneCode,
    setPhoneCodeInvalid,
    requestedPhone,
    setRequestedPhone,
    phoneResendSeconds,
    setPhoneResendSeconds,
    rememberMe,
    setFormError,
    cooldownSeconds,
    setCooldownSeconds,
    setLoginCompleting,
    phoneLoginPasswordRef,
    loginSubmissionLockedRef,
    passwordMutation,
    phoneRequestMutation,
    phoneVerifyMutation,
    form,
    locale,
    organizationCode,
    onStepChange,
  } = state;
  const completeLogin = (
    response: LoginResponseDto,
    identifier: string,
    identifierType: 'EMAIL' | 'PHONE',
  ) => {
    setLoginCompleting(true);
    resetDashboardInitialLoader();
    writeRememberedLogin(rememberMe ? { identifier, identifierType } : null);
    router.replace(loginDestination(locale, response));
  };

  const acquireLoginSubmission = () => {
    if (loginSubmissionLockedRef.current) return false;
    loginSubmissionLockedRef.current = true;
    return true;
  };

  const releaseLoginSubmission = () => {
    loginSubmissionLockedRef.current = false;
  };

  const applyApiError = (error: unknown) => {
    if (isPlgApiError(error) && error.payload.code === 'MFA_REQUIRED') {
      setStep('mfa');
      onStepChange?.('mfa');
      setMfaCode('');
      setMfaInvalid(false);
      setFormError(null);
      return true;
    }
    if (isPlgApiError(error)) {
      for (const fieldError of error.payload.fieldErrors ?? []) {
        if (['identifier', 'password'].includes(fieldError.field)) {
          form.setError(fieldError.field as keyof LoginFormValues, {
            message: copy.fieldValidation,
            type: 'server',
          });
        }
      }
      if (error.status === 429 && error.retryAfterMs) {
        setCooldownSeconds(Math.max(1, Math.ceil(error.retryAfterMs / 1_000)));
      }
      if (error.payload.code === 'MFA_CODE_INVALID') setMfaInvalid(true);
      if (error.payload.code === 'PHONE_OTP_INVALID') setPhoneCodeInvalid(true);
    }
    setFormError(loginErrorView(error, copy));
    return false;
  };

  const submitCredentials = form.handleSubmit(async (values) => {
    if (cooldownSeconds > 0 || !acquireLoginSubmission()) return;
    setFormError(null);
    setMfaInvalid(false);

    const normalizedIdentifier =
      values.identifierType === 'PHONE'
        ? toEgyptPhoneIdentifier(values.identifier)
        : values.identifier.trim();

    if (values.identifierType === 'PHONE') {
      try {
        await phoneRequestMutation.mutateAsync({
          data: { organizationCode, password: values.password, phone: normalizedIdentifier },
        });
        phoneLoginPasswordRef.current = values.password;
        setAuthFlow('phoneOtp');
        setRequestedPhone(normalizedIdentifier);
        setPhoneCode('');
        setPhoneCodeInvalid(false);
        setPhoneResendSeconds(90);
        setStep('phoneOtp');
        onStepChange?.('phoneOtp');
      } catch (error) {
        applyApiError(error);
      } finally {
        releaseLoginSubmission();
      }
      return;
    }

    setAuthFlow('password');
    const data: LoginDto = {
      identifier: normalizedIdentifier,
      identifierType: 'EMAIL',
      organizationCode,
      password: values.password,
      rememberMe,
    };

    let completed = false;
    try {
      const response = await passwordMutation.mutateAsync({ data });
      completeLogin(response.data, normalizedIdentifier, 'EMAIL');
      completed = true;
    } catch (error) {
      applyApiError(error);
    } finally {
      if (!completed) releaseLoginSubmission();
    }
  });

  const resendPhoneCode = async () => {
    if (!requestedPhone || phoneResendSeconds > 0 || phoneRequestMutation.isPending) return;
    setFormError(null);
    try {
      await phoneRequestMutation.mutateAsync({
        data: {
          organizationCode,
          password: phoneLoginPasswordRef.current,
          phone: requestedPhone,
        },
      });
      setPhoneCode('');
      setPhoneCodeInvalid(false);
      setPhoneResendSeconds(90);
    } catch (error) {
      applyApiError(error);
    }
  };

  const verifyPhoneCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phoneVerifyMutation.isPending || cooldownSeconds > 0 || loginSubmissionLockedRef.current)
      return;
    setFormError(null);
    setPhoneCodeInvalid(false);
    if (!/^\d{6}$/.test(phoneCode)) {
      setPhoneCodeInvalid(true);
      return;
    }

    if (!acquireLoginSubmission()) return;
    let completed = false;
    try {
      const response = await phoneVerifyMutation.mutateAsync({
        data: {
          code: phoneCode,
          organizationCode,
          phone: requestedPhone,
          rememberMe,
        },
      });
      completeLogin(response.data, requestedPhone, 'PHONE');
      completed = true;
    } catch (error) {
      setAuthFlow('phoneOtp');
      applyApiError(error);
    } finally {
      if (!completed) releaseLoginSubmission();
    }
  };

  const submitMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      passwordMutation.isPending ||
      phoneVerifyMutation.isPending ||
      cooldownSeconds > 0 ||
      loginSubmissionLockedRef.current
    )
      return;
    setFormError(null);
    setMfaInvalid(false);
    const valid =
      mfaMethod === 'totp'
        ? /^\d{6}$/.test(mfaCode)
        : /^[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){4}$/.test(mfaCode);
    if (!valid) {
      setMfaInvalid(true);
      return;
    }

    if (!acquireLoginSubmission()) return;
    let completed = false;
    try {
      if (authFlow === 'phoneOtp') {
        const response = await phoneVerifyMutation.mutateAsync({
          data: {
            code: phoneCode,
            organizationCode,
            phone: requestedPhone,
            rememberMe,
            ...(mfaMethod === 'totp' ? { totpCode: mfaCode } : {}),
            ...(mfaMethod === 'recovery' ? { recoveryCode: mfaCode.trim().toUpperCase() } : {}),
          },
        });
        completeLogin(response.data, requestedPhone, 'PHONE');
        completed = true;
        return;
      }

      const values = form.getValues();
      const normalizedIdentifier = values.identifier.trim();
      const response = await passwordMutation.mutateAsync({
        data: {
          identifier: normalizedIdentifier,
          identifierType: 'EMAIL',
          organizationCode,
          password: values.password,
          rememberMe,
          ...(mfaMethod === 'totp' ? { totpCode: mfaCode } : {}),
          ...(mfaMethod === 'recovery' ? { recoveryCode: mfaCode.trim().toUpperCase() } : {}),
        },
      });
      completeLogin(response.data, normalizedIdentifier, 'EMAIL');
      completed = true;
    } catch (error) {
      applyApiError(error);
    } finally {
      if (!completed) releaseLoginSubmission();
    }
  };

  return { submitCredentials, resendPhoneCode, verifyPhoneCode, submitMfa };
}
