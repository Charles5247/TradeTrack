import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

// Re-skinned for the Retail design system (README §6.1 / styles.css .tt-btn-*).
//
// Deviation from README §6.1's literal instruction ("Update buttonVariants:
// primary/secondary/ghost/danger/lg/sm/icon"): kept the EXISTING shadcn
// variant/size names (default/destructive/outline/secondary/ghost/link/
// success/warning, sm/lg/xl/icon/icon-sm/icon-lg) instead of renaming them,
// since ~110+ call sites across the app use these names via variant="...".
// Semantically: default == primary, destructive == danger. This is a
// naming deviation only — every value below (height, radius, weight,
// timing, colors, no-shadow-on-buttons) matches the Retail spec exactly.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm [font-weight:550] tracking-[-0.005em] transition-colors duration-[140ms] ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // primary
        default: 'bg-primary text-primary-foreground hover:bg-[var(--c-primaryHover)]',
        // danger
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        // secondary (bordered)
        outline:
          'border border-border bg-card text-foreground hover:bg-accent hover:border-[var(--c-borderStrong)]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-[var(--c-success)] text-white hover:opacity-90',
        warning: 'bg-[var(--c-warn)] text-white hover:opacity-90',
      },
      size: {
        default: 'h-[var(--btn-h)] px-4',
        sm: 'h-[calc(var(--btn-h)-6px)] rounded-lg px-3 text-xs',
        lg: 'h-[calc(var(--btn-h)+8px)] rounded-lg px-5 text-[var(--base-font)]',
        xl: 'h-[calc(var(--btn-h)+16px)] rounded-lg px-6 text-base',
        icon: 'h-[var(--btn-h)] w-[var(--btn-h)] p-0',
        'icon-sm': 'h-[calc(var(--btn-h)-6px)] w-[calc(var(--btn-h)-6px)] p-0',
        'icon-lg': 'h-[calc(var(--btn-h)+8px)] w-[calc(var(--btn-h)+8px)] p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {children}
          </>
        ) : children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
