import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './lib/cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden="true" className={cn('plg-skeleton rounded-[9px]', className)} {...props} />
  );
}

export function StatePanel({
  action,
  className,
  description,
  icon,
  title,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  action?: ReactNode;
  description: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div
      className={cn(
        'grid min-h-32 place-items-center rounded-[12px] border border-dashed border-border bg-surface p-5 text-center',
        className,
      )}
      {...props}
    >
      <div className="max-w-sm">
        {icon ? (
          <span className="mx-auto mb-2.5 grid size-9 place-items-center rounded-[9px] bg-brand-soft text-brand">
            {icon}
          </span>
        ) : null}
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-[13px] leading-5 text-ink-muted">{description}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
