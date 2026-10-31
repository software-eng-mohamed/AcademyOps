'use client';
import { loginFormActions } from './login-form-actions';
import { type LoginFormProps, useLoginFormState } from './use-login-form-state';
export function useLoginForm(props: LoginFormProps) {
  const state = useLoginFormState(props);
  return { ...state, ...loginFormActions(state) };
}
export type LoginFormModel = ReturnType<typeof useLoginForm>;
