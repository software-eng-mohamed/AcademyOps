import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './lib/cn';

export const buttonVariants = cva(
  'relative isolate inline-flex min-h-10 items-center justify-center gap-2 overflow-hidden rounded-[10px] px-4 text-[13px] font-semibold outline-none transition-[color,background-color,border-color,box-shadow,filter] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-focus/16 disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none',
  {
    variants: {
      variant: {
        primary:
          'border border-brand-strong/20 bg-brand text-primary-foreground shadow-control hover:bg-brand-bright hover:shadow-raised active:bg-brand-strong active:shadow-control',
        commerce:
          'border border-brand-strong/20 bg-brand text-primary-foreground shadow-control hover:bg-brand-bright hover:shadow-raised active:bg-brand-strong active:shadow-control',
        secondary:
          'border border-border-strong bg-surface-subtle text-ink shadow-control hover:bg-surface hover:shadow-raised active:bg-surface-subtle',
        tertiary:
          'border border-border/80 text-brand hover:border-brand/40 hover:bg-brand-soft active:bg-brand-soft',
        ghost:
          'border border-border/40 text-ink-muted hover:border-border hover:bg-surface-subtle hover:text-ink active:bg-surface-subtle',
        destructive:
          'border border-danger/25 bg-surface text-danger shadow-control hover:border-danger/40 hover:bg-danger-soft',
      },
      size: {
        compact: 'min-h-8 rounded-[8px] px-2.5 text-[11px]',
        small: 'min-h-9 px-3.5 text-xs',
        default: 'min-h-10 px-4',
        large: 'min-h-11 px-5 text-sm',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { size: 'default', variant: 'primary' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    loadingLabel?: string;
  };

export function Button({
  asChild = false,
  children,
  className,
  disabled,
  loading = false,
  loadingLabel = 'Working',
  size,
  type = 'button',
  variant,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        className={cn(
          buttonVariants({ size, variant }),
          (disabled || loading) && 'pointer-events-none opacity-55',
          className,
        )}
        data-slot="button"
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ size, variant }), className)}
      data-slot="button"
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      <span className={cn('relative z-10 inline-flex items-center gap-2', loading && 'invisible')}>
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 z-10 flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="size-3.5 animate-spin rounded-full border-2 border-current border-e-transparent [animation-duration:800ms]"
          />
          <span>{loadingLabel}</span>
        </span>
      ) : null}
    </button>
  );
}
