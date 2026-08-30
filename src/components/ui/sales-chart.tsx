"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils/format";

/**
 * New component per README §6.2 — `<SalesChart>`: SVG line + area chart
 * with dashed prev-period comparison. See design_files/dashboard.jsx →
 * `SalesChart`. README explicitly says: "Use recharts (already in deps)
 * for the real implementation" rather than porting the handoff's raw
 * hand-rolled SVG path math — recharts is already a project dependency
 * and already used by the existing Dashboard revenue chart, so this
 * wraps it instead of reinventing axis/tooltip/responsive behavior.
 */
export interface SalesChartPoint {
  label: string;
  value: number;
  previous?: number;
}

export function SalesChart({
  data,
  height = 260,
  currency = true,
}: {
  data: SalesChartPoint[];
  height?: number;
  currency?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="tt-sales-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c-primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--c-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--c-textMuted)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--c-textMuted)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (currency ? `₦${(Number(v) / 1000).toFixed(0)}k` : String(v))}
          width={48}
        />
        <Tooltip
          formatter={(value, name) => [
            currency ? formatCurrency(Number(value)) : String(value ?? ""),
            name === "value" ? "This period" : "Previous period",
          ]}
          contentStyle={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            borderRadius: "var(--radius)",
            fontSize: 12,
          }}
        />
        {data.some((d) => d.previous !== undefined) && (
          <Line
            type="monotone"
            dataKey="previous"
            stroke="var(--c-textFaint)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--c-primary)"
          strokeWidth={2.5}
          fill="url(#tt-sales-grad)"
          dot={{ r: 3, fill: "var(--c-primary)", stroke: "var(--c-surface)", strokeWidth: 2 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
