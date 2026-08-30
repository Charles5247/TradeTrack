"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * New component per README §6.2 / §9.5 — `<ErrorState>`: danger-tinted
 * card, alert icon, title, body, "Try again" button. See
 * design_files/templates.jsx → `ErrorState`.
 */
export interface ErrorStateProps {
  title?: string;
  body?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn("rounded-[var(--radius-lg)] border p-14 text-center", className)}
      style={{
        background: "color-mix(in oklch, var(--c-danger), transparent 96%)",
        borderColor: "color-mix(in oklch, var(--c-danger), transparent 82%)",
      }}
    >
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)]"
        style={{
          background: "color-mix(in oklch, var(--c-danger), transparent 88%)",
          color: "var(--c-danger)",
        }}
      >
        <AlertTriangle size={28} strokeWidth={1.75} />
      </div>
      <div className="tt-head mb-2 text-xl text-foreground">{title}</div>
      {body && (
        <div className="mx-auto mb-5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
          {body}
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-[var(--btn-h)] items-center gap-2 rounded-[var(--radius)] border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw size={14} strokeWidth={1.75} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
