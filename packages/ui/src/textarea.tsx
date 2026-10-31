'use client';

import type { TextareaHTMLAttributes } from 'react';
import { forwardRef, useContext } from 'react';
import { FieldControlContext } from './field';
import { cn } from './lib/cn';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  const field = useContext(FieldControlContext);
  const describedBy = [props['aria-describedby'], field.describedBy].filter(Boolean).join(' ');

  return (
    <textarea
      ref={ref}
      aria-describedby={describedBy || undefined}
      aria-invalid={props['aria-invalid'] ?? (field.invalid || undefined)}
      className={cn(
        'min-h-24 w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-3 text-sm leading-5 text-ink shadow-control outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out placeholder:text-ink-muted hover:border-border-strong focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/10 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-65 aria-invalid:border-danger aria-invalid:ring-danger/10 motion-reduce:transition-none',
        className,
      )}
      data-slot="textarea"
      rows={rows}
      {...props}
    />
  );
});
