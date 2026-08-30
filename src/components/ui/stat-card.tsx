"use client";

import * as React from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

/**
 * New component per README §6.2 — `<StatCard>` (`label, value, delta,
 * deltaDir, sub, Icon` props). See design_files/dashboard.jsx →
 * `StatCard`. Renders the new `.tt-stat`/`.tt-stat-label`/
 * `.tt-stat-value`/`.tt-stat-delta` CSS (added to globals.css this
 * session) instead of the pre-existing `<Card>`-based `StatsCard`
 * (src/components/dashboard/stats-card.tsx, note the extra "s") which
 * the old Dashboard page used — that component stays untouched for any
 * other call sites, this is the new Retail-token-native replacement.
 */
export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaDir?: "up" | "down";
  sub?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  delta,
  deltaDir,
  sub,
  icon: Icon,
  loading,
  className,
  onClick,
}: StatCardProps) {
  if (loading) {
    return (
      <div className={cn("tt-stat", className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-7 rounded-[var(--radius)]" />
        </div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-3.5 w-20" />
      </div>
    );
  }

  return (
    <div
      className={cn("tt-stat", onClick && "cursor-pointer transition-shadow hover:shadow-md", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="tt-stat-label">{label}</div>
        {Icon && (
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius)]"
            style={{
              background: "color-mix(in oklch, var(--c-primary), transparent 90%)",
              color: "var(--c-primary)",
            }}
          >
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className="tt-stat-value tt-tabular">{value}</div>
      <div className="flex min-h-[20px] items-center gap-2">
        {delta && (
          <div className="tt-stat-delta" data-dir={deltaDir}>
            {deltaDir === "up" ? (
              <ArrowUp size={12} strokeWidth={1.75} />
            ) : deltaDir === "down" ? (
              <ArrowDown size={12} strokeWidth={1.75} />
            ) : null}
            {delta}
          </div>
        )}
        {sub && <div className="tt-muted text-xs">{sub}</div>}
      </div>
    </div>
  );
}
