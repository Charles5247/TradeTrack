import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/** Retail styling for forms that deliberately keep native select behavior. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({className, ...props}, ref) => <select ref={ref} className={cn('h-[var(--input-h)] w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[var(--base-font)] text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50',className)} {...props} />
);
NativeSelect.displayName = 'NativeSelect';
