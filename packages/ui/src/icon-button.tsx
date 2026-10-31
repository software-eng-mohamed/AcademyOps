import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './lib/cn';

export const iconButtonVariants = cva(
  'inline-grid shrink-0 place-items-center outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-focus/14 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
  {
    variants: {
      shape: {
        round: 'rounded-full',
        rounded: 'rounded-[10px]',
      },
      tone: {
        surface:
          'border border-border bg-surface text-ink-muted shadow-control hover:border-border-strong hover:bg-surface-subtle hover:text-brand hover:shadow-raised',
        ghost: 'border border-transparent text-ink-muted hover:bg-surface-subtle hover:text-brand',
      },
      size: {
        compact: 'size-8',
        default: 'size-9',
        large: 'size-10',
      },
    },
    defaultVariants: { shape: 'rounded', size: 'default', tone: 'surface' },
  },
);

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants> & {
    label: string;
  };

export function IconButton({
  children,
  className,
  label,
  size,
  shape,
  tone,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(iconButtonVariants({ shape, size, tone }), className)}
      data-slot="icon-button"
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
