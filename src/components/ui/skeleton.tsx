import { cn } from '@/lib/utils/cn';

// Re-skinned per README §6.1 to match the Skeleton component in
// templates.jsx: bg color-mix(borderStrong, transparent 50%), the
// tt-skeleton 1.4s opacity-pulse keyframe (defined in globals.css)
// instead of Tailwind's default animate-pulse scale/opacity combo.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-[color-mix(in_oklch,var(--c-borderStrong),transparent_50%)] [animation:tt-skeleton_1.4s_ease-in-out_infinite]',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
