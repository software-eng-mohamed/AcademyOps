'use client';

import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import {
  Children,
  type ComponentProps,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import { FieldControlContext } from './field';
import { cn } from './lib/cn';

export type SelectOption<Value extends string = string> = {
  disabled?: boolean;
  label: ReactNode;
  value: Value;
};

export function Select<Value extends string>({
  ariaLabel,
  className,
  disabled,
  id,
  name,
  onBlur,
  onValueChange,
  options,
  placeholder = 'Select an option',
  value,
}: {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onBlur?: () => void;
  onValueChange: (value: Value | null) => void;
  options: readonly SelectOption<Value>[];
  placeholder?: string;
  value: Value | null;
}) {
  const field = useContext(FieldControlContext);

  return (
    <SelectPrimitive.Root
      {...(disabled ? { disabled: true } : {})}
      {...(name ? { name } : {})}
      onValueChange={(next) => onValueChange((next || null) as Value | null)}
      value={value ?? ''}
    >
      <SelectPrimitive.Trigger
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid || undefined}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex min-h-[38px] min-w-0 items-center justify-between gap-3 rounded-[9px] border border-border bg-surface px-3.5 text-start text-sm text-ink shadow-[var(--plg-shadow-control)] outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-border-strong focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/10 data-[placeholder]:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-65 motion-reduce:transition-none',
          className,
        )}
        id={id}
        onBlur={onBlur}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown aria-hidden="true" className="size-3.5 text-ink-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          align="start"
          className="plg-popover-content pointer-events-auto z-[70] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-[var(--plg-shadow-popover)] outline-none"
          position="popper"
          sideOffset={6}
        >
          <SelectScrollButton direction="up" />
          <SelectPrimitive.Viewport className="plg-scrollbar max-h-64 overflow-y-auto">
            {options.map((option) => (
              <SelectPrimitive.Item
                className="relative flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pe-8 ps-2.5 text-sm text-ink outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-dropdown-item-hover-background data-[highlighted]:text-ink data-[state=checked]:font-semibold"
                key={option.value}
                {...(option.disabled ? { disabled: true } : {})}
                value={option.value}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute end-2 text-brand">
                  <Check aria-hidden="true" className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectScrollButton direction="down" />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

type OptionProps = {
  children?: ReactNode;
  disabled?: boolean;
  value?: string;
};

const emptyOptionValue = '__plg_empty_option__';

function collectOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment || child.type === 'optgroup') {
      options.push(...collectOptions((child as ReactElement<OptionProps>).props.children));
      return;
    }
    if (child.type !== 'option') return;
    const props = (child as ReactElement<OptionProps>).props;
    options.push({
      ...(props.disabled ? { disabled: true } : {}),
      label: props.children,
      value: props.value || emptyOptionValue,
    });
  });
  return options;
}

/**
 * Radix-backed transition adapter for feature forms that still express options as JSX children.
 * It deliberately renders no native select UI; new code should prefer `Select` with `options`.
 */
export function FormSelect({
  'aria-label': ariaLabel,
  children,
  className,
  disabled,
  id,
  name,
  onBlur,
  onChange,
  value,
}: {
  'aria-label'?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onBlur?: () => void;
  onChange?: (event: { currentTarget: { value: string }; target: { value: string } }) => void;
  value?: string;
}) {
  const options = useMemo(() => collectOptions(children), [children]);
  const selectedValue = value === undefined ? null : value || emptyOptionValue;
  return (
    <Select
      {...(ariaLabel ? { ariaLabel } : {})}
      {...(className ? { className } : {})}
      {...(disabled ? { disabled: true } : {})}
      {...(id ? { id } : {})}
      {...(name ? { name } : {})}
      {...(onBlur ? { onBlur } : {})}
      onValueChange={(next) => {
        const nextValue = !next || next === emptyOptionValue ? '' : next;
        onChange?.({ currentTarget: { value: nextValue }, target: { value: nextValue } });
      }}
      options={options}
      value={selectedValue}
    />
  );
}

function SelectScrollButton({ direction }: { direction: 'down' | 'up' }) {
  const Primitive =
    direction === 'up' ? SelectPrimitive.ScrollUpButton : SelectPrimitive.ScrollDownButton;
  const Icon = direction === 'up' ? ChevronUp : ChevronDown;
  return (
    <Primitive className="flex h-7 cursor-pointer items-center justify-center text-ink-muted">
      <Icon aria-hidden="true" className="size-3.5" />
    </Primitive>
  );
}

export const SelectRoot = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;
export const SelectTrigger = SelectPrimitive.Trigger;
export const SelectContent = SelectPrimitive.Content;
export const SelectItem = SelectPrimitive.Item;
export const SelectLabel = SelectPrimitive.Label;
export const SelectSeparator = SelectPrimitive.Separator;

export type SelectRootProps = ComponentProps<typeof SelectPrimitive.Root>;
export type SelectContentProps = ComponentProps<typeof SelectPrimitive.Content>;
export type SelectItemProps = ComponentProps<typeof SelectPrimitive.Item>;
