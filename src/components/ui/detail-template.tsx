"use client";

import * as React from "react";
import { StatCard, type StatCardProps } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils/cn";

/**
 * New component per README §6.2 — `<DetailTemplate>`: detail page shell
 * (title + meta + KPI cards + tabs + main/side layout). See
 * design_files/templates.jsx → `DetailTemplate`. Use for Sale detail, PO
 * detail, Vendor detail, Merchant detail, Warehouse detail (README §7).
 *
 * Ported to use Tailwind grid utilities directly instead of the
 * handoff's literal `.tt-grid`/`.tt-grid-N` classes, consistent with
 * this codebase's Step-1 architecture decision (see globals.css's
 * grep-confirmed absence of `.tt-grid`) of building new layout with
 * Tailwind + CSS vars rather than porting the handoff's own utility
 * class names verbatim.
 */
export interface DetailTemplateProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: { label: string; value: React.ReactNode }[];
  statusBadge?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  overviewCards?: StatCardProps[];
  tabs?: React.ReactNode;
  mainContent: React.ReactNode;
  sideContent?: React.ReactNode;
  className?: string;
}

export function DetailTemplate({
  title,
  subtitle,
  meta,
  statusBadge,
  primary,
  secondary,
  overviewCards = [],
  tabs,
  mainContent,
  sideContent,
  className,
}: DetailTemplateProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <div className="mb-3 flex items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="tt-head text-[28px] leading-[1.1] text-foreground sm:text-[32px]">
                {title}
              </div>
              {statusBadge}
            </div>
            {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
            {meta && meta.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-6">
                {meta.map((m) => (
                  <div key={m.label}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {m.label}
                    </div>
                    <div className="text-sm font-medium text-foreground">{m.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {(primary || secondary) && (
            <div className="flex shrink-0 items-center gap-2">
              {secondary}
              {primary}
            </div>
          )}
        </div>

        {overviewCards.length > 0 && (
          <div
            className={cn(
              "grid gap-4",
              overviewCards.length >= 4
                ? "grid-cols-2 lg:grid-cols-4"
                : overviewCards.length === 3
                  ? "grid-cols-1 sm:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2",
              tabs ? "mb-5" : "",
            )}
          >
            {overviewCards.map((c, i) => (
              <StatCard key={i} {...c} />
            ))}
          </div>
        )}

        {tabs}
      </div>

      <div className={cn("grid gap-5", sideContent ? "lg:grid-cols-[1.6fr_1fr]" : "grid-cols-1")}>
        <div className="min-w-0 space-y-5">{mainContent}</div>
        {sideContent && <div className="min-w-0 space-y-5">{sideContent}</div>}
      </div>
    </div>
  );
}
