"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * New component per README §6.2 / §9.5 — `<LoadingState>` for tables
 * (5-6 skeleton rows, per README §9.5). See
 * design_files/templates.jsx → `LoadingState`. Uses the existing
 * re-skinned `<Table>` primitive (Step 2) rather than a raw `<table>`
 * so header/row styling (`.tt-table` height vars, hover states) stays
 * consistent with every other table on the site.
 */
export interface LoadingStateProps {
  rows?: number;
  columns?: number;
  /** Optional column headers to render literally instead of skeleton bars. */
  columnLabels?: string[];
}

export function LoadingState({ rows = 6, columns = 5, columnLabels }: LoadingStateProps) {
  const cols = columnLabels?.length ?? columns;
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: cols }).map((_, i) => (
              <TableHead key={i}>
                {columnLabels ? columnLabels[i] : <Skeleton className="h-3 w-16" />}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <TableCell key={c}>
                  <Skeleton
                    className="h-3.5"
                    style={{ width: c === 0 ? 160 : c === cols - 1 ? 60 : 100 }}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
