'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/api/demo/credentials';
import {
  useAuthControllerLoginV1,
  usePhoneOtpControllerRequestV1,
  usePhoneOtpControllerVerifyV1,
} from '@/api/generated/identity/identity';
import type { Locale } from '@/lib/locales';
import { getLoginCopy } from './login-copy';
import type { LoginErrorView } from './login-error';
import { createLoginSchema, type LoginFormValues } from './login-schema';
import { normalizeEgyptPhoneLocalInput } from './phone-identifier';
import { readRememberedLogin } from './remembered-login';
import { useLoginFormMotion } from './use-login-form-motion';
import { useLoginMfaMethodMotion } from './use-login-mfa-motion';
export type LoginStep = 'credentials' | 'changePhone' | 'phoneOtp' | 'mfa';
type MfaMethod = 'totp' | 'recovery';
type AuthFlow = 'password' | 'phoneOtp';
export type LoginFormProps = {
  locale: Locale;
  organizationCode: string;
  onStepChange?: (step: LoginStep) => void;
  demo?: boolean;
};
export function useLoginFormState({
  locale,
  organizationCode,
  onStepChange,
  demo = false,
}: LoginFormProps) {
  const copy = getLoginCopy(locale);
  const router = useRouter();
  const schema = useMemo(() => createLoginSchema(copy), [copy]);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [authFlow, setAuthFlow] = useState<AuthFlow>('password');
  const [mfaMethod, setMfaMethod] = useState<MfaMethod>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaInvalid, setMfaInvalid] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeInvalid, setPhoneCodeInvalid] = useState(false);
  const [requestedPhone, setRequestedPhone] = useState('');
  const [phoneResendSeconds, setPhoneResendSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [formError, setFormError] = useState<LoginErrorView | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [loginCompleting, setLoginCompleting] = useState(false);
  const credentialsRef = useRef<HTMLFormElement>(null);
  const phoneOtpRef = useRef<HTMLFormElement>(null);
  const mfaRef = useRef<HTMLFormElement>(null);
  const userInitiatedIdentifierChangeRef = useRef(false);
  const phoneLoginPasswordRef = useRef('');
  const loginSubmissionLockedRef = useRef(false);
  const passwordMutation = useAuthControllerLoginV1({
    mutation: { retry: false },
    request: { allowUnauthorized: true },
  });
  const phoneRequestMutation = usePhoneOtpControllerRequestV1({
    mutation: { retry: false },
    request: { allowUnauthorized: true },
  });
  const phoneVerifyMutation = usePhoneOtpControllerVerifyV1({
    mutation: { retry: false },
    request: { allowUnauthorized: true },
  });
  const form = useForm<LoginFormValues>({
    defaultValues: {
      identifier: demo ? DEMO_EMAIL : '',
      identifierType: 'EMAIL',
      password: demo ? DEMO_PASSWORD : '',
    },
    resolver: zodResolver(schema),
  });
  const identifierType = form.watch('identifierType');
  useLoginFormMotion(credentialsRef, identifierType, userInitiatedIdentifierChangeRef);
  useLoginMfaMethodMotion(mfaRef, step, mfaMethod);

  useEffect(() => {
    if (demo) return;
    const remembered = readRememberedLogin();
    if (!remembered) return;
    form.setValue('identifierType', remembered.identifierType);
    form.setValue(
      'identifier',
      remembered.identifierType === 'PHONE'
        ? normalizeEgyptPhoneLocalInput(remembered.identifier)
        : remembered.identifier,
    );
    setRememberMe(true);
  }, [form, demo]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(
      () => setCooldownSeconds((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (phoneResendSeconds <= 0) return;
    const timer = window.setInterval(
      () => setPhoneResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [phoneResendSeconds]);

  return {
    copy,
    router,
    step,
    setStep,
    authFlow,
    setAuthFlow,
    mfaMethod,
    setMfaMethod,
    mfaCode,
    setMfaCode,
    mfaInvalid,
    setMfaInvalid,
    phoneCode,
    setPhoneCode,
    phoneCodeInvalid,
    setPhoneCodeInvalid,
    requestedPhone,
    setRequestedPhone,
    phoneResendSeconds,
    setPhoneResendSeconds,
    showPassword,
    setShowPassword,
    rememberMe,
    setRememberMe,
    formError,
    setFormError,
    cooldownSeconds,
    setCooldownSeconds,
    loginCompleting,
    setLoginCompleting,
    credentialsRef,
    phoneOtpRef,
    mfaRef,
    userInitiatedIdentifierChangeRef,
    phoneLoginPasswordRef,
    loginSubmissionLockedRef,
    passwordMutation,
    phoneRequestMutation,
    phoneVerifyMutation,
    form,
    identifierType,
    locale,
    organizationCode,
    onStepChange,
  };
}
export type LoginFormState = ReturnType<typeof useLoginFormState>;
