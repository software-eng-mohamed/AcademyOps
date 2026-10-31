'use client';

import { createContext, type ReactNode } from 'react';

export const FieldControlContext = createContext<{
  describedBy?: string | undefined;
  invalid?: boolean | undefined;
}>({});

type FieldProps = {
  children: ReactNode;
  description?: string | undefined;
  error?: string | undefined;
  htmlFor: string;
  label: string;
};

export function Field({ children, description, error, htmlFor, label }: FieldProps) {
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <FieldControlContext.Provider
      value={{
        describedBy: [descriptionId, errorId].filter(Boolean).join(' ') || undefined,
        invalid: Boolean(error),
      }}
    >
      <div className="grid gap-1.5">
        <label className="text-[13px] font-semibold text-text-primary" htmlFor={htmlFor}>
          {label}
        </label>
        {children}
        {description ? (
          <p className="text-xs leading-5 text-text-secondary" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {error ? (
          <p className="text-xs font-medium text-text-error-primary" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </FieldControlContext.Provider>
  );
}
