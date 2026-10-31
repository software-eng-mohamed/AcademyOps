'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ReactElement, type ReactNode, useEffect, useState } from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { cn } from './lib/cn';

type ResponsiveOverlayProps = {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  footer?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
  trigger?: ReactElement;
};

function useMobileOverlay() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return mobile;
}

function OverlayHeader({
  description,
  title,
}: Pick<ResponsiveOverlayProps, 'description' | 'title'>) {
  return (
    <div className="min-w-0 flex-1">
      <DialogPrimitive.Title className="text-sm font-semibold text-ink">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-1 text-[11px] leading-4 text-ink-muted">
          {description}
        </DialogPrimitive.Description>
      ) : null}
    </div>
  );
}

function CloseGlyph() {
  return <X aria-hidden="true" className="size-4" />;
}

export function ResponsiveOverlay({
  children,
  className,
  description,
  footer,
  onOpenChange,
  open,
  title,
  trigger,
}: ResponsiveOverlayProps) {
  const mobile = useMobileOverlay();

  if (mobile) {
    return (
      <VaulDrawer.Root onOpenChange={onOpenChange} open={open} repositionInputs>
        {trigger ? <VaulDrawer.Trigger asChild>{trigger}</VaulDrawer.Trigger> : null}
        <VaulDrawer.Portal>
          <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-[var(--plg-color-overlay)]" />
          <VaulDrawer.Content
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[var(--plg-radius-lg)] border border-b-0 border-border-strong bg-surface shadow-[var(--plg-shadow-sheet)] outline-none',
              className,
            )}
          >
            <VaulDrawer.Handle className="mt-2.5 bg-border-strong" />
            <div className="flex items-start gap-4 border-b border-border px-5 pb-4 pt-3">
              <div className="min-w-0 flex-1">
                <VaulDrawer.Title className="text-sm font-semibold text-ink">
                  {title}
                </VaulDrawer.Title>
                {description ? (
                  <VaulDrawer.Description className="mt-1 text-[11px] leading-4 text-ink-muted">
                    {description}
                  </VaulDrawer.Description>
                ) : null}
              </div>
              <VaulDrawer.Close
                aria-label="Close panel"
                className="grid size-8 shrink-0 place-items-center rounded-sm text-ink-muted outline-none hover:bg-surface-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-focus/20"
              >
                <CloseGlyph />
              </VaulDrawer.Close>
            </div>
            <div className="plg-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? (
              <div className="shrink-0 border-t border-border bg-surface-subtle/95 px-5 py-3.5">
                {footer}
              </div>
            ) : null}
          </VaulDrawer.Content>
        </VaulDrawer.Portal>
      </VaulDrawer.Root>
    );
  }

  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="plg-dialog-overlay fixed inset-0 z-50 bg-[var(--plg-color-overlay)]" />
        <DialogPrimitive.Content
          className={cn(
            'plg-sheet-content fixed bottom-4 end-4 top-4 z-50 flex w-[min(calc(100vw-2rem),28rem)] flex-col overflow-hidden rounded-[var(--plg-radius-lg)] border border-border-strong bg-surface shadow-[var(--plg-shadow-sheet)] outline-none',
            className,
          )}
        >
          <div className="flex items-start gap-4 border-b border-border px-5 py-4">
            <OverlayHeader description={description} title={title} />
            <DialogPrimitive.Close
              aria-label="Close panel"
              className="grid size-8 shrink-0 place-items-center rounded-sm text-ink-muted outline-none hover:bg-surface-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-focus/20"
            >
              <CloseGlyph />
            </DialogPrimitive.Close>
          </div>
          <div className="plg-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-border bg-surface-subtle/95 px-5 py-3.5">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
