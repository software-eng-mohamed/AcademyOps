'use client';

import gsap from 'gsap';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input, type InputProps } from '@/components/base/input/input';
import { cx } from '@/utils/cx';
import type { LoginCopy } from './login-copy';
import type { LoginErrorView } from './login-error';

export function MethodSelector<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 grid min-w-0 grid-cols-2 gap-2 border-0 p-0"
      data-method-selector
    >
      {options.map((option) => (
        <Button
          aria-pressed={value === option.value}
          className="h-11 w-full rounded-lg"
          data-method-selected={value === option.value}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
          variant={value === option.value ? 'primary' : 'secondary'}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}

export function PasswordInput({
  fieldClassName,
  hidePasswordLabel,
  inputClassName,
  isPasswordVisible,
  onPasswordVisibilityChange,
  showPasswordLabel,
  ...props
}: InputProps & {
  hidePasswordLabel: string;
  isPasswordVisible: boolean;
  onPasswordVisibilityChange: (visible: boolean) => void;
  showPasswordLabel: string;
}) {
  const visibilityLabel = isPasswordVisible ? hidePasswordLabel : showPasswordLabel;
  const buttonRef = useRef<HTMLButtonElement>(null);

  const togglePassword = () => {
    onPasswordVisibilityChange(!isPasswordVisible);
    const button = buttonRef.current;
    if (!button || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(
      button,
      { rotation: isPasswordVisible ? 3 : -3, scale: 0.92 },
      { clearProps: 'transform', duration: 0.14, ease: 'power1.out', rotation: 0, scale: 1 },
    );
  };

  return (
    <Input
      {...props}
      fieldClassName={cx('[direction:ltr]', fieldClassName)}
      inputClassName={cx('[direction:ltr] text-left', inputClassName)}
      trailingAddon={
        <Button
          aria-label={visibilityLabel}
          aria-pressed={isPasswordVisible}
          className="-m-1 size-8 rounded-md bg-transparent text-text-secondary shadow-none hover:bg-transparent hover:text-text-primary active:bg-transparent"
          disabled={props.isDisabled}
          iconOnly
          leadingIcon={isPasswordVisible ? EyeOff : Eye}
          onClick={togglePassword}
          ref={buttonRef}
          size="small"
          type="button"
          variant="ghost"
        />
      }
      type={isPasswordVisible ? 'text' : 'password'}
    />
  );
}

export function FieldMessage({ invalid, text }: { invalid: boolean; text: string }) {
  return (
    <p
      className={
        invalid
          ? 'text-caption-1-medium text-text-error-primary'
          : 'text-caption-1-medium text-text-secondary'
      }
    >
      {text}
    </p>
  );
}

export function FormError({
  copy,
  cooldownSeconds,
  error,
}: {
  copy: LoginCopy;
  cooldownSeconds: number;
  error: LoginErrorView | null;
}) {
  if (!error) return null;
  return (
    <div
      className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] dark:border-red-500/30 dark:bg-red-950/30 p-4 text-sm text-text-primary shadow-xs backdrop-blur-xs"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400 ring-1 ring-red-500/20">
          <AlertCircle aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-semibold text-text-primary">{error.message}</p>
          {cooldownSeconds > 0 ? (
            <p className="mt-1 font-semibold text-red-600 dark:text-red-400">
              {cooldownSeconds}
              {copy.secondsShort}
            </p>
          ) : null}
          {error.correlationId ? (
            <div className="mt-2.5 flex items-center">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-secondary bg-background-primary-default px-2.5 py-1 text-[11px] font-mono text-text-secondary shadow-2xs">
                <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
                <span>{copy.supportId}:</span>
                <bdi
                  dir="ltr"
                  className="select-all font-semibold tracking-wider text-text-primary"
                >
                  {error.correlationId}
                </bdi>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
