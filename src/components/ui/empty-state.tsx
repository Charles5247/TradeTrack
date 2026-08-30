"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * New component per README §6.2 / §9.5 — `<EmptyState>`: icon + title +
 * body + primary/secondary CTA, muted background. See
 * design_files/templates.jsx → `EmptyState`. Every screen must show a
 * real empty state (README §14) instead of a bare blank area — this is
 * the shared primitive so each screen doesn't hand-roll its own.
 */
export interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondary,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border p-14 text-center",
        className,
      )}
      style={{ background: "var(--c-surfaceAlt)" }}
    >
      {Icon && (
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)]"
          style={{
            background: "color-mix(in oklch, var(--c-primary), transparent 88%)",
            color: "var(--c-primary)",
          }}
        >
          <Icon size={28} />
        </div>
      )}
      <div className="tt-head mb-2 text-xl text-foreground">{title}</div>
      {body && (
        <div className="mx-auto mb-5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
          {body}
        </div>
      )}
      {(action || secondary) && (
        <div className="flex items-center justify-center gap-2">
          {secondary}
          {action}
        </div>
      )}
    </div>
  );
}
