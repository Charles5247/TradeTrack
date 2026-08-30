import * as React from 'react';
import { cn } from '@/lib/utils/cn';

// New component per README §6.2 — matches .tt-kbd (styles.css): mono font,
// bordered "physical key" look with a slightly thicker bottom border,
// surfaceAlt background. Used for the ⌘K search hint in the header and any
// other keyboard-shortcut hint (e.g. POS's ⌘F2 barcode-scan hint).
const Kbd = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'tt-mono inline-flex items-center justify-center rounded-[4px] border border-border border-b-2 bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground',
        className
      )}
      {...props}
    />
  )
);
Kbd.displayName = 'Kbd';

export { Kbd };
