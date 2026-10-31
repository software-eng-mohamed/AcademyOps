'use client';

import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';

export function Tooltip({
  children,
  content,
  label,
}: {
  children: ReactElement;
  content: ReactNode;
  label?: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={240} skipDelayDuration={80}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger aria-label={label} asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            className="plg-popover-content z-[70] max-w-64 rounded-sm border border-border bg-ink px-2.5 py-1.5 text-[11px] leading-4 text-white shadow-[var(--plg-shadow-popover)]"
            sideOffset={6}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-ink" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
