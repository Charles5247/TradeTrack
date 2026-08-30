import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

// Re-skinned per README §6.1 to match .tt-badge (pill shape, color-mix
// tinted background/border/text using the semantic tokens) instead of
// shadcn's solid-fill rectangular badges. Kept existing variant names
// (default/secondary/destructive/outline/success/warning/info/pending)
// rather than renaming to the handoff's literal neutral/primary/success/
// warn/danger/info/solid set — call sites across ~10 files use these
// names via variant="...". Mapping: default≈primary(solid), secondary≈
// neutral, destructive≈danger, warning≈warn, outline kept as a true
// outline (border only, transparent bg) since it has distinct existing
// usage from "neutral".
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground',
        secondary: 'border-border bg-muted text-muted-foreground',
        destructive:
          'border-[color-mix(in_oklch,var(--c-danger),transparent_70%)] bg-[color-mix(in_oklch,var(--c-danger),transparent_85%)] text-[var(--c-danger)]',
        outline: 'border-border bg-transparent text-foreground',
        success:
          'border-[color-mix(in_oklch,var(--c-success),transparent_70%)] bg-[color-mix(in_oklch,var(--c-success),transparent_85%)] text-[var(--c-success)]',
        warning:
          'border-[color-mix(in_oklch,var(--c-warn),transparent_70%)] bg-[color-mix(in_oklch,var(--c-warn),transparent_85%)] text-[var(--c-warn)]',
        info:
          'border-[color-mix(in_oklch,var(--c-info),transparent_70%)] bg-[color-mix(in_oklch,var(--c-info),transparent_85%)] text-[var(--c-info)]',
        pending:
          'border-[color-mix(in_oklch,var(--c-warn),transparent_70%)] bg-[color-mix(in_oklch,var(--c-warn),transparent_85%)] text-[var(--c-warn)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
