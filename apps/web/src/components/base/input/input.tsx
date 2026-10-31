'use client';

import { type ComponentType, createContext, type ReactNode, type Ref, useContext } from 'react';
import type {
  InputProps as AriaInputProps,
  TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components';
import {
  Group as AriaGroup,
  Input as AriaInput,
  TextField as AriaTextField,
} from 'react-aria-components';
import { cx, sortCx } from '@/utils/cx';
import { HintText } from './hint-text';
import { Label } from './label';

/**
 * Figma source: Board UI → Input (node 3665:1849).
 *
 * Architecture (mirrors the Untitled UI / React Aria pattern):
 *
 *   InputBase   — the styled field shell. Renders <AriaGroup> + adornments
 *                 + <AriaInput>. State (hover / focus / disabled / invalid)
 *                 arrives as render-prop booleans from Aria.
 *   TextField   — wraps <AriaTextField> and a TextFieldContext so size /
 *                 classes can flow from the composer down into InputBase
 *                 without prop drilling.
 *   Input       — opinionated composition: TextField → Label → InputBase
 *                 → HintText. The component most consumers use.
 *
 * Why React Aria:
 *   - Label ↔ input ↔ hint association via aria-labelledby / aria-describedby
 *   - aria-required, aria-invalid auto-applied
 *   - Form library / native validation integration
 *   - i18n, RTL, autofill edge cases handled
 *   - Render-prop state surfaces `isFocusWithin`, `isHovered`, `isDisabled`,
 *     `isInvalid`, `isRequired` — no CSS pseudo gymnastics
 *
 * Visuals stay 1:1 with Figma — see `styles/theme.css` for the tokens.
 */

type InputSize = 'medium' | 'small';

type IconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

/* -------------------------------------------------------------------------- */
/*  TextFieldContext                                                           */
/* -------------------------------------------------------------------------- */

interface TextFieldContextValue {
  size?: InputSize | undefined;
  fieldClassName?: string | undefined;
  inputClassName?: string | undefined;
}

const TextFieldContext = createContext<TextFieldContextValue>({});

/* -------------------------------------------------------------------------- */
/*  TextField                                                                  */
/* -------------------------------------------------------------------------- */

export interface TextFieldProps
  extends Omit<AriaTextFieldProps, 'className'>,
    TextFieldContextValue {
  className?: string | undefined;
  children?:
    | ReactNode
    | ((state: {
        isRequired: boolean;
        isInvalid: boolean;
        isDisabled: boolean;
        isReadOnly: boolean;
      }) => ReactNode);
}

export function TextField({
  size = 'medium',
  fieldClassName,
  inputClassName,
  className,
  children,
  ...props
}: TextFieldProps) {
  return (
    <TextFieldContext.Provider value={{ size, fieldClassName, inputClassName }}>
      <AriaTextField
        {...props}
        data-input-size={size}
        className={cx('group flex h-max w-full flex-col items-start gap-1', className)}
      >
        {children as never /* RAC accepts render-prop children */}
      </AriaTextField>
    </TextFieldContext.Provider>
  );
}

TextField.displayName = 'TextField';

/* -------------------------------------------------------------------------- */
/*  InputBase                                                                  */
/* -------------------------------------------------------------------------- */

export interface InputBaseProps extends Omit<AriaInputProps, 'size' | 'className'> {
  size?: InputSize | undefined;
  className?: string | undefined;
  leadingIcon?: IconComponent | undefined;
  trailingIcon?: IconComponent | undefined;
  /** Custom element rendered in the leading slot (Phone basic uses this). */
  leadingAddon?: ReactNode;
  /** Interactive element rendered in the trailing slot (for example a password toggle). */
  trailingAddon?: ReactNode;
  /** Class for the field shell. */
  fieldClassName?: string | undefined;
  /** Ref to the <input> element. */
  ref?: Ref<HTMLInputElement> | undefined;
  /** Ref to the field shell wrapper. */
  groupRef?: Ref<HTMLDivElement> | undefined;
}

const inputStyles = sortCx({
  field: [
    'relative flex w-full items-center',
    'rounded-2lg',
    'bg-background-tertiary-default text-foreground-icon-tertiary',
    'ring-2 ring-inset ring-transparent',
    'transition-[background-color,box-shadow,color] duration-[var(--input-transition-ms)] ease',
  ].join(' '),

  fieldSize: {
    medium: 'p-2', // 8px all sides → h auto = 36
    small: 'h-8 px-1.5 py-2', // 32 / 6 / 8
  },

  // When a leadingAddon is present (Phone basic): tighten left padding.
  fieldWithAddonSize: {
    medium: 'h-9 pl-1 pr-2 py-2', // 36 / 4 / 8 / 8
    small: 'h-8 pl-1 pr-1.5 py-2',
  },

  content: 'flex w-full items-center gap-2 min-w-0',
  leftSection: 'flex flex-1 items-center gap-0.5 min-w-0',

  input: [
    'min-w-0 flex-1 bg-transparent border-0 outline-none p-0 m-0',
    'font-sans text-body-regular text-text-primary pl-1',
    'placeholder:text-text-tertiary',
    'focus:placeholder:text-text-primary',
    'disabled:text-input-disabled-text disabled:placeholder:text-input-disabled-text',
    'disabled:cursor-not-allowed',
    'aria-invalid:placeholder:text-text-error-placeholder',
  ].join(' '),

  icon: 'size-5 shrink-0',
});

export function InputBase({
  size: sizeProp,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  leadingAddon,
  trailingAddon,
  fieldClassName,
  className,
  ref,
  groupRef,
  ...inputProps
}: InputBaseProps) {
  const ctx = useContext(TextFieldContext);
  const size: InputSize = sizeProp ?? ctx.size ?? 'medium';
  const hasAddon = leadingAddon !== undefined && leadingAddon !== null;

  return (
    <AriaGroup
      ref={groupRef}
      className={({ isFocusWithin, isHovered, isDisabled, isInvalid }) =>
        cx(
          inputStyles.field,
          hasAddon ? inputStyles.fieldWithAddonSize[size] : inputStyles.fieldSize[size],
          // Hover: idle, no focus, no disabled, no invalid
          isHovered && !isFocusWithin && !isDisabled && !isInvalid && 'ring-border-button-hover',
          // Focus wins over hover
          isFocusWithin && !isDisabled && !isInvalid && 'ring-border-button-active',
          // Disabled
          isDisabled && 'bg-input-disabled-background text-input-disabled-foreground',
          // Invalid
          isInvalid && 'bg-background-tertiary-error text-foreground-icon-error',
          ctx.fieldClassName,
          fieldClassName,
        )
      }
    >
      <div className={inputStyles.content}>
        <div className={inputStyles.leftSection}>
          {hasAddon ? (
            leadingAddon
          ) : Leading ? (
            <Leading className={inputStyles.icon} aria-hidden />
          ) : null}
          <AriaInput
            ref={ref}
            {...inputProps}
            className={cx(inputStyles.input, ctx.inputClassName, className)}
          />
        </div>
        {trailingAddon ?? (Trailing ? <Trailing className={inputStyles.icon} aria-hidden /> : null)}
      </div>
    </AriaGroup>
  );
}

InputBase.displayName = 'InputBase';

/* -------------------------------------------------------------------------- */
/*  Input (composed)                                                           */
/* -------------------------------------------------------------------------- */

export interface InputProps
  extends Omit<TextFieldProps, 'children'>,
    Pick<
      InputBaseProps,
      | 'leadingIcon'
      | 'trailingIcon'
      | 'leadingAddon'
      | 'trailingAddon'
      | 'fieldClassName'
      | 'groupRef'
      | 'ref'
    > {
  label?: ReactNode;
  hint?: ReactNode;
  /** Show an info icon next to the label. Replace with tooltip when Tooltip lands. */
  tooltip?: boolean | string | undefined;
  placeholder?: string | undefined;
}

export function Input({
  label,
  hint,
  tooltip,
  placeholder,
  leadingIcon,
  trailingIcon,
  leadingAddon,
  trailingAddon,
  fieldClassName,
  ref,
  groupRef,
  className,
  ...textFieldProps
}: InputProps) {
  const ariaLabel =
    textFieldProps['aria-label'] ??
    (!label && typeof placeholder === 'string' ? placeholder : undefined);
  return (
    <TextField
      {...textFieldProps}
      className={className}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      {({ isRequired, isInvalid }) => (
        <>
          {label && (
            <Label isRequired={isRequired} isInvalid={isInvalid} tooltip={tooltip}>
              {label}
            </Label>
          )}
          <InputBase
            {...(ref ? { ref } : {})}
            {...(groupRef ? { groupRef } : {})}
            {...(placeholder ? { placeholder } : {})}
            {...(leadingIcon ? { leadingIcon } : {})}
            {...(trailingIcon ? { trailingIcon } : {})}
            leadingAddon={leadingAddon}
            trailingAddon={trailingAddon}
            {...(fieldClassName ? { fieldClassName } : {})}
          />
          {hint && <HintText isInvalid={isInvalid}>{hint}</HintText>}
        </>
      )}
    </TextField>
  );
}

Input.displayName = 'Input';
