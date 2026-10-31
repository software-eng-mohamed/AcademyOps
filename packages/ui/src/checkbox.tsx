'use client';

import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { type ReactNode, useId } from 'react';
import { cn } from './lib/cn';

export function Checkbox({
  checked,
  className,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  className?: string;
  disabled?: boolean;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex items-center gap-2 text-xs font-medium text-ink cursor-pointer select-none',
        disabled && 'cursor-not-allowed opacity-55',
        className,
      )}
    >
      <CheckboxPrimitive.Root
        checked={checked}
        className="grid size-4 place-items-center rounded-[5px] border border-border-strong bg-surface text-white outline-none transition-colors data-[state=checked]:border-brand data-[state=checked]:bg-brand focus-visible:ring-3 focus-visible:ring-focus/15 cursor-pointer disabled:cursor-not-allowed"
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      >
        <CheckboxPrimitive.Indicator className="grid place-items-center text-white">
          <Check aria-hidden="true" className="size-3 text-white" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span>{label}</span>
    </label>
  );
}
