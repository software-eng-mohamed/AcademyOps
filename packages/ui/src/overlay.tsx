'use client';

import { Dialog as DialogPrimitive, Popover as PopoverPrimitive } from 'radix-ui';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from './lib/cn';

type CompositeTriggerProps = ComponentProps<typeof DialogPrimitive.Trigger> & {
  children: ReactNode;
};

const DrawerCloseContext = createContext<{
  onAnimationEnd: () => void;
} | null>(null);

export function Drawer({
  open: controlledOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Root>) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  const prevOpenRef = useRef(controlledOpen);
  useEffect(() => {
    if (controlledOpen !== prevOpenRef.current) {
      prevOpenRef.current = controlledOpen;
      if (controlledOpen) {
        closingRef.current = false;
        setClosing(false);
      }
    }
  }, [controlledOpen]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        closingRef.current = true;
        setClosing(true);
      } else {
        closingRef.current = false;
        setClosing(false);
        onOpenChange?.(true);
      }
    },
    [onOpenChange],
  );

  const handleAnimationEnd = useCallback(() => {
    if (closingRef.current) {
      closingRef.current = false;
      setClosing(false);
      onOpenChange?.(false);
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (closing) {
      const timer = setTimeout(() => {
        handleAnimationEnd();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [closing, handleAnimationEnd]);

  const effectiveOpen = closing ? false : controlledOpen;

  return (
    <DrawerCloseContext.Provider value={{ onAnimationEnd: handleAnimationEnd }}>
      <DialogPrimitive.Root
        {...(controlledOpen !== undefined ? { open: effectiveOpen } : {})}
        {...(defaultOpen !== undefined ? { defaultOpen } : {})}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DrawerCloseContext.Provider>
  );
}

export function DrawerTrigger({ asChild, children, ...props }: CompositeTriggerProps) {
  return (
    <DialogPrimitive.Trigger {...(asChild ? { asChild: true } : {})} {...props}>
      {children}
    </DialogPrimitive.Trigger>
  );
}

export function DrawerClose({
  asChild,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close {...(asChild ? { asChild: true } : {})} {...props}>
      {children}
    </DialogPrimitive.Close>
  );
}

type DrawerContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  variant?: 'sheet' | 'navigation';
};

function DialogOverlay({
  ref,
  variant,
}: {
  ref?: ComponentProps<typeof DialogPrimitive.Overlay>['ref'];
  variant?: DrawerContentProps['variant'];
}) {
  // The portal's presence ref must reach the DOM so it waits for the backdrop's exit.
  return (
    <DialogPrimitive.Overlay
      className="plg-dialog-overlay fixed inset-0 z-50 bg-[var(--plg-color-overlay)]"
      data-plg-overlay={variant}
      ref={ref}
    />
  );
}

function isOverlayPortalTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const selector =
    '[data-rac], [role="listbox"], [role="option"], [data-react-aria-top-layer], [data-radix-popper-content-wrapper], [data-radix-popover-content], .plg-popover-content';
  return Boolean(target.closest(selector));
}

export function DrawerContent({ className, variant = 'sheet', ref, ...props }: DrawerContentProps) {
  const closeContext = useContext(DrawerCloseContext);
  const internalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = internalRef.current;
    if (!el || !closeContext) return;
    const handleAnimEnd = (event: AnimationEvent) => {
      if (event.target === el) {
        closeContext.onAnimationEnd();
      }
    };
    el.addEventListener('animationend', handleAnimEnd);
    return () => el.removeEventListener('animationend', handleAnimEnd);
  }, [closeContext]);

  return (
    <DialogPrimitive.Portal>
      <DialogOverlay variant={variant} />
      <DialogPrimitive.Content
        ref={(node) => {
          internalRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref && typeof ref === 'object') {
            (ref as { current: HTMLDivElement | null }).current = node;
          }
        }}
        className={cn(
          variant === 'sheet'
            ? 'plg-sheet-content fixed bottom-4 end-4 top-4 z-50 flex w-[min(calc(100vw-2rem),28rem)] flex-col overflow-hidden rounded-[var(--plg-radius-lg)] border border-border-strong bg-surface p-0 shadow-[var(--plg-shadow-sheet)] focus:outline-none'
            : 'plg-navigation-content fixed inset-y-0 start-0 z-50 w-[min(86vw,18rem)] overflow-hidden border-e border-border-strong bg-surface p-0 shadow-[var(--plg-shadow-sheet)] focus:outline-none',
          className,
        )}
        data-plg-overlay-content={variant}
        onPointerDownOutside={(event) => {
          if (isOverlayPortalTarget(event.target)) event.preventDefault();
          props.onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (isOverlayPortalTarget(event.target)) event.preventDefault();
          props.onInteractOutside?.(event);
        }}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export const DrawerTitle = DialogPrimitive.Title;
export const DrawerDescription = DialogPrimitive.Description;

export function DrawerHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'plg-drawer-header flex shrink-0 items-start justify-between gap-4 border-b border-border-secondary px-6 py-4.5',
        className,
      )}
      {...props}
    />
  );
}

export function DrawerBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'plg-drawer-body plg-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5',
        className,
      )}
      {...props}
    />
  );
}

export function DrawerFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'plg-drawer-footer shrink-0 border-t border-border-secondary bg-background-primary-default px-6 py-4',
        className,
      )}
      {...props}
    />
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

export function DrawerCloseButton({
  'aria-label': ariaLabel = 'Close panel',
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      aria-label={ariaLabel}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-background-secondary-default hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring motion-reduce:transition-none',
        className,
      )}
      {...props}
    >
      <CloseIcon />
    </DialogPrimitive.Close>
  );
}

export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DrawerTrigger;
export const ModalClose = DrawerClose;
export const ModalTitle = DialogPrimitive.Title;
export const ModalDescription = DialogPrimitive.Description;

export function ModalContent({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'plg-modal-content fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),34rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--plg-radius-lg)] border border-border-secondary bg-background-primary-default p-0 shadow-2xl focus:outline-none',
          className,
        )}
        data-plg-overlay-content="modal"
        onPointerDownOutside={(event) => {
          if (isOverlayPortalTarget(event.target)) event.preventDefault();
          props.onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (isOverlayPortalTarget(event.target)) event.preventDefault();
          props.onInteractOutside?.(event);
        }}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export function ModalHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'plg-modal-header flex shrink-0 items-start justify-between gap-4 border-b border-border-secondary px-6 py-5',
        className,
      )}
      {...props}
    />
  );
}

export function ModalBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'plg-modal-body plg-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5',
        className,
      )}
      {...props}
    />
  );
}

export function ModalFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'plg-modal-footer flex shrink-0 items-center justify-end gap-3 border-t border-border-secondary bg-background-primary-default px-6 py-4.5',
        className,
      )}
      {...props}
    />
  );
}

export const ModalCloseButton = DrawerCloseButton;

export function PanelSection({
  children,
  className,
  description,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  title: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div>
        <h3 className="text-xs font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export const Popover = PopoverPrimitive.Root;

export function PopoverTrigger({
  asChild,
  children,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return (
    <PopoverPrimitive.Trigger {...(asChild ? { asChild: true } : {})} {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  );
}

type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Content>;

export function PopoverContent({
  align = 'center',
  className,
  side = 'bottom',
  sideOffset = 8,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        className={cn(
          'plg-popover-content pointer-events-auto z-[70] origin-[var(--radix-popover-content-transform-origin)] overflow-hidden rounded-md border border-border bg-surface p-2 text-ink shadow-[var(--plg-shadow-popover)] outline-none',
          className,
        )}
        side={side}
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
