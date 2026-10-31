'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useContext, useState } from 'react';
import { Button } from './button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from './command';
import { FieldControlContext } from './field';
import { cn } from './lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from './overlay';

export type ComboboxOption<Value extends string = string> = {
  disabled?: boolean;
  label: string;
  value: Value;
};

export function Combobox<Value extends string>({
  className,
  disabled,
  emptyLabel = 'No matching options.',
  id,
  onValueChange,
  options,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search options…',
  value,
}: {
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  id?: string;
  onValueChange: (value: Value | null) => void;
  options: readonly ComboboxOption<Value>[];
  placeholder?: string;
  searchPlaceholder?: string;
  value: Value | null;
}) {
  const [open, setOpen] = useState(false);
  const field = useContext(FieldControlContext);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-describedby={field.describedBy}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={field.invalid || undefined}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-ink-muted',
            className,
          )}
          disabled={disabled}
          id={id}
          role="combobox"
          variant="secondary"
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                {...(option.disabled ? { disabled: true } : {})}
                key={option.value}
                onSelect={() => {
                  onValueChange(option.value === value ? null : option.value);
                  setOpen(false);
                }}
                value={`${option.label} ${option.value}`}
              >
                <Check
                  aria-hidden="true"
                  className={cn(
                    'size-3.5 text-brand',
                    value === option.value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="truncate">{option.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
