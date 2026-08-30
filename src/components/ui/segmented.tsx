"use client";

/**
 * <Segmented> — pill-shaped segmented control (README §6.x / handoff's
 * `.tt-seg`/`.tt-seg-item`, styles added to globals.css). Pulled forward
 * from Step 6 of the build order because the re-skinned Pricing page's
 * Monthly/Yearly toggle needs it now; the remaining Step 6 components
 * (StatCard, SalesChart, EmptyState, LoadingState, ErrorState, Toast,
 * DetailTemplate, FormTemplate) still ship separately.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={`tt-seg ${className ?? ""}`} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          data-active={value === opt.value ? "true" : "false"}
          className="tt-seg-item"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
