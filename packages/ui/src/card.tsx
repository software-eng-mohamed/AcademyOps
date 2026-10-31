import type { ComponentProps } from 'react';
import { cn } from './lib/cn';

export function Card({
  className,
  density = 'default',
  interactive = false,
  ...props
}: ComponentProps<'div'> & { density?: 'default' | 'compact'; interactive?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5 rounded-md border border-border bg-surface py-5 text-ink shadow-card',
        density === 'compact' &&
          'gap-3 py-4 [&_[data-slot=card-content]]:px-4 [&_[data-slot=card-header]]:px-4',
        interactive &&
          'transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-border-strong hover:shadow-raised motion-reduce:transform-none motion-reduce:transition-none',
        className,
      )}
      data-density={density}
      data-interactive={interactive || undefined}
      data-slot="card"
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-1.5 px-5', className)} data-slot="card-header" {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-base font-semibold tracking-tight', className)}
      data-slot="card-title"
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-sm leading-6 text-ink-muted', className)}
      data-slot="card-description"
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5', className)} data-slot="card-content" {...props} />;
}
