'use client';

import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { cn } from './lib/cn';

export const Menu = MenuPrimitive.Root;

export function MenuTrigger({ children }: { children: ReactElement }) {
  return <MenuPrimitive.Trigger asChild>{children}</MenuPrimitive.Trigger>;
}

export function MenuContent({
  align = 'end',
  alignOffset = 0,
  children,
  className,
  side = 'bottom',
  sideOffset = 7,
}: {
  align?: 'start' | 'center' | 'end';
  alignOffset?: number;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        alignOffset={alignOffset}
        className={cn(
          'plg-popover-content pointer-events-auto z-[70] min-w-48 rounded-md border border-border bg-surface p-1 shadow-[var(--plg-shadow-popover)] outline-none',
          className,
        )}
        side={side}
        sideOffset={sideOffset}
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2.5 text-xs text-ink outline-none data-[highlighted]:bg-surface-subtle data-[highlighted]:text-ink data-[disabled]:cursor-not-allowed data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

export const MenuSeparator = MenuPrimitive.Separator;
