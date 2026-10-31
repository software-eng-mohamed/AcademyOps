'use client';

import type { ReactNode, Ref } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type {
  ListBoxItemProps as AriaListBoxItemProps,
  SelectProps as AriaSelectProps,
  SelectValueRenderProps as AriaSelectValueRenderProps,
} from 'react-aria-components';
import {
  Button as AriaButton,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
} from 'react-aria-components';
import {
  MENU_ITEM,
  MENU_ITEM_ACTIVE,
  MENU_ITEMS_CONTAINER,
  MENU_POPOVER_SURFACE,
} from '@/components/base/dropdown/menu-styles';
import { ChevronDownSmall } from '@/components/foundations/icons/chevrons';
import { cx } from '@/utils/cx';
import { useDismissOnOutsidePress, useTriggerToggle } from '@/utils/use-dismiss-on-outside-press';

/**
 * Figma source: Board UI → dashboard 1 dropdown triggers ("All prices" filter
 * node 3731:3208, table status dropdown node 3731:3264).
 *
 * Select with a button trigger styled 1:1 with Figma:
 *   trigger  bg color/white, 1px border/button/default, shadow/xs,
 *            px 10 py 8, radius/2lg (10px), gap 6,
 *            Body 1/Medium text color/neutral/950,
 *            16px chevron (custom stroke glyph) in text/secondary
 *
 * The open popover/listbox shares the BoardUI menu recipe with Dropdown:
 * radius/2xl panel, p 10, shadow/dropdown, 150ms fade/scale/blur motion,
 * and radius/2lg rows with the same hover/selected surface.
 *
 * Item content is free-form: pass a `StatusDot` + text for status selects.
 */

export type SelectSize = 'sm' | 'md';

const SelectSizeContext = createContext<SelectSize>('md');

export interface SelectProps<T extends object> extends Omit<AriaSelectProps<T>, 'children'> {
  /** Trigger width. Defaults to hug content; the menu uses the shared 266px width. */
  className?: string;
  triggerClassName?: string;
  /** Connect an external field label to the actual select button. */
  triggerId?: string;
  /** Classes for the open popover (e.g. constrain its width). */
  popoverClassName?: string;
  /** `md` (default) or `sm` for compact/dense contexts (e.g. compact tables). */
  size?: SelectSize;
  children: ReactNode;
  items?: Iterable<T>;
  /** Customise the trigger's rendered value (e.g. a compact flag + dial code).
   *  Falls back to the selected item's own content when omitted. */
  renderValue?: ReactNode | ((values: AriaSelectValueRenderProps<T>) => ReactNode);
  ref?: Ref<HTMLDivElement>;
}

export function Select<T extends object>({
  className,
  triggerClassName,
  triggerId,
  popoverClassName,
  size = 'md',
  children,
  items,
  renderValue,
  ref,
  ...props
}: SelectProps<T>) {
  // The popover is `isNonModal`: react-aria's modal scroll lock puts
  // `overflow: hidden` on <html>, which — with this app's `h-full` root —
  // collapses the page scroll position and visibly yanks the sticky
  // sidebar upward every time a select opens. Non-modal skips the lock,
  // but also disables react-aria's outside-press dismissal (`isDismissable`
  // is hard-coupled to `!isNonModal` in usePopover), so open state is
  // controlled here and dismissal restored manually — the same fix as the
  // date-picker family (see utils/use-dismiss-on-outside-press.ts).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dismiss = useCallback(() => setIsOpen(false), []);
  const outsideRefs = useMemo(() => [triggerRef, popoverRef], []);
  useDismissOnOutsidePress(isOpen, dismiss, outsideRefs);
  // Pressing the trigger while open closes the popover instead of reopening
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);
  const buttonId = triggerId ?? (props as { id?: string }).id;

  return (
    <AriaSelect
      ref={ref}
      {...props}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!allowOpenChange(open)) return;
        setIsOpen(open);
      }}
      className={cx('group flex flex-col', className)}
    >
      {({ isOpen }) => (
        <>
          <AriaButton
            {...(buttonId ? { id: buttonId } : {})}
            ref={triggerRef}
            className={cx(
              'flex w-full cursor-pointer items-center justify-between rounded-2lg',
              'border border-border-button-default bg-background-primary-default shadow-xs',
              'text-text-primary',
              'transition-[background-color,border-color,box-shadow,padding,font-size] duration-200 ease',
              'hover:bg-background-primary-hover hover:border-border-button-hover',
              'outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring',
              'disabled:cursor-not-allowed disabled:bg-background-primary-disabled disabled:text-text-tertiary disabled:shadow-none',
              size === 'sm'
                ? 'gap-1 px-[7px] py-1 text-body-2-medium'
                : 'gap-1.5 px-2.5 py-2 text-body-medium',
              triggerClassName,
            )}
          >
            <AriaSelectValue
              className={cx(
                'flex min-w-0 items-center truncate',
                size === 'sm' ? 'gap-1' : 'gap-[5px]',
              )}
            >
              {renderValue as never /* RAC accepts node or render-prop */}
            </AriaSelectValue>
            <ChevronDownSmall
              className={cx(
                'shrink-0 text-text-secondary transition-transform duration-200 ease',
                size === 'sm' ? 'size-3.5' : 'size-4',
                isOpen && 'rotate-180',
              )}
            />
          </AriaButton>
          <SelectSizeContext.Provider value={size}>
            <AriaPopover
              ref={popoverRef}
              isNonModal
              offset={4}
              style={{ pointerEvents: 'auto' }}
              className={cx(
                'pointer-events-auto',
                'z-[70]',
                'min-w-[max(var(--trigger-width,0px),266px)]',
                MENU_POPOVER_SURFACE,
                // Listbox rows already space themselves 4px apart, so the
                // surface sits a touch tighter than the action-menu Dropdown.
                'p-2',
                popoverClassName,
              )}
            >
              <AriaListBox
                {...(items ? { items } : {})}
                className={cx(MENU_ITEMS_CONTAINER, 'max-h-[240px] overflow-auto')}
              >
                {children}
              </AriaListBox>
            </AriaPopover>
          </SelectSizeContext.Provider>
        </>
      )}
    </AriaSelect>
  );
}

export interface SelectItemProps extends Omit<AriaListBoxItemProps, 'children'> {
  children?: ReactNode;
}

export function SelectItem({ className, children, ...props }: SelectItemProps) {
  const size = useContext(SelectSizeContext);
  const textValue = props.textValue ?? (typeof children === 'string' ? children : undefined);
  return (
    <AriaListBoxItem
      {...props}
      {...(textValue !== undefined ? { textValue } : {})}
      className={(state) =>
        cx(
          MENU_ITEM,
          size === 'sm' ? 'px-2 py-1.5 text-body-2-medium' : 'text-body-medium',
          (state.isFocused || state.isSelected) && MENU_ITEM_ACTIVE,
          state.isDisabled && 'cursor-not-allowed text-text-disabled',
          typeof className === 'function' ? className(state) : className,
        )
      }
    >
      {children}
    </AriaListBoxItem>
  );
}
