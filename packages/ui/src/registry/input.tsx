// shadcn/ui (MIT), new-york-v4/input. Source: https://ui.shadcn.com/r/styles/new-york-v4/input.json
// Only import paths, theme color-token aliases and logical text alignment are adapted.
import type * as React from 'react';

import { cn } from '../lib/cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-border-strong bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-brand selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-surface-subtle/30',
        'focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50',
        'aria-invalid:border-danger aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
