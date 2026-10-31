'use client';
import { LoginCredentialsStep } from './login-credentials-step';
import { LoginMfaStep, LoginPhoneOtpStep } from './login-otp-steps';
import { useLoginForm } from './use-login-form';
import type { LoginFormProps } from './use-login-form-state';

export type { LoginStep } from './use-login-form-state';
export function LoginForm(props: LoginFormProps) {
  const model = useLoginForm(props);
  if (model.step === 'phoneOtp') return <LoginPhoneOtpStep model={model} />;
  if (model.step === 'mfa') return <LoginMfaStep model={model} />;
  return <LoginCredentialsStep model={model} />;
}
