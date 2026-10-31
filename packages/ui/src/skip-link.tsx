import type { AnchorHTMLAttributes } from 'react';
import { cn } from './lib/cn';

export function SkipLink({
  className,
  children,
  href = '#main-content',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(
        'fixed start-4 top-4 z-50 -translate-y-24 rounded-md bg-ink px-4 py-3 font-semibold text-white focus:translate-y-0 focus:outline-none focus:ring-3 focus:ring-focus motion-reduce:transition-none',
        className,
      )}
      href={href}
      {...props}
    >
      {children}
    </a>
  );
}
