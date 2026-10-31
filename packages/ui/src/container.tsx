import type { HTMLAttributes } from 'react';
import { cn } from './lib/cn';

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'box-border mx-auto min-w-0 w-full max-w-content px-4 sm:px-6 lg:px-8',
        className,
      )}
      {...props}
    />
  );
}
