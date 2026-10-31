import type { HTMLAttributes } from 'react';
import { cn } from './lib/cn';

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  label: string;
  size?: 'small' | 'default';
  status: 'neutral' | 'info' | 'success' | 'warning' | 'critical';
};

const statusClass = {
  critical: 'border-danger/15 bg-danger-soft text-danger',
  info: 'border-info/15 bg-info-soft text-info',
  neutral: 'border-border bg-surface-subtle text-ink-muted',
  success: 'border-success/15 bg-success-soft text-success',
  warning: 'border-warning/15 bg-warning-soft text-warning',
};

export function StatusBadge({
  className,
  label,
  size = 'default',
  status,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold',
        size === 'small' ? 'min-h-5 px-2 text-[10px]' : 'min-h-6 px-2.5 text-xs',
        statusClass[status],
        className,
      )}
      {...props}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
