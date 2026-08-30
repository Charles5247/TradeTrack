"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  TrendingUp,
  Package,
  AlertTriangle,
  XCircle,
  Users,
  ArrowLeftRight,
  Download,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { SalesChart, type SalesChartPoint } from "@/components/ui/sales-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Segmented } from "@/components/ui/segmented";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatRelativeTime } from "@/lib/utils/format";
import { useAuthStore } from "@/store";
import { useI18n } from "@/i18n";
import type { Sale } from "@/types";

type RangeKey = "today" | "week" | "month";

async function fetchDashboardData() {
  const supabase = createClient();
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).toISOString();
  const weekStart = new Date(
    today.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const prevWeekStart = new Date(
    today.getTime() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const monthStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    1,
  ).toISOString();

  const [
    todaySales,
    weeklySales,
    prevWeeklySales,
    monthlySales,
    products,
    allInventory,
    pendingVendors,
    pendingTransfers,
    recentSales,
    revenueData,
    prevRevenueData,
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("total")
      .gte("created_at", todayStart)
      .eq("status", "completed"),
    supabase
      .from("sales")
      .select("total")
      .gte("created_at", weekStart)
      .eq("status", "completed"),
    supabase
      .from("sales")
      .select("total")
      .gte("created_at", prevWeekStart)
      .lt("created_at", weekStart)
      .eq("status", "completed"),
    supabase
      .from("sales")
      .select("total")
      .gte("created_at", monthStart)
      .eq("status", "completed"),
    supabase.from("products").select("id").eq("status", "active"),
    supabase.from("inventory").select("id, quantity, min_stock_level"),
    supabase
      .from("vendor_transactions")
      .select("id,total_value,amount_paid")
      .eq("status", "pending"),
    supabase.from("warehouse_transfers").select("id").eq("status", "pending"),
    supabase
      .from("sales")
      .select(
        "id,invoice_number,total,payment_method,status,created_at,cashier_id",
      )
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("sales")
      .select("created_at,total")
      .gte("created_at", weekStart)
      .eq("status", "completed")
      .order("created_at", { ascending: true }),
    supabase
      .from("sales")
      .select("created_at,total")
      .gte("created_at", prevWeekStart)
      .lt("created_at", weekStart)
      .eq("status", "completed")
      .order("created_at", { ascending: true }),
  ]);

  // Surface the first query error (if any) so the page can render a real
  // ErrorState instead of silently showing zeros.
  const firstError = [
    todaySales,
    weeklySales,
    prevWeeklySales,
    monthlySales,
    products,
    allInventory,
    pendingVendors,
    pendingTransfers,
    recentSales,
    revenueData,
    prevRevenueData,
  ].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const sum = (rows: { total: number }[] | null) =>
    (rows || []).reduce((s, r) => s + (r.total || 0), 0);

  const todayRevenue = sum(todaySales.data);
  const weeklyRevenue = sum(weeklySales.data);
  const prevWeeklyRevenue = sum(prevWeeklySales.data);
  const monthlyRevenue = sum(monthlySales.data);
  const pendingDebt = (pendingVendors.data || []).reduce(
    (s, r) => s + ((r.total_value || 0) - (r.amount_paid || 0)),
    0,
  );

  const inventoryRows = allInventory.data || [];
  const outOfStockCount = inventoryRows.filter((r) => r.quantity === 0).length;
  const lowStockCount = inventoryRows.filter(
    (r) => r.quantity > 0 && r.quantity <= (r.min_stock_level || 5),
  ).length;

  // Build a day-by-day series for the current week and the previous week so
  // <SalesChart> can render the dashed comparison line.
  const dayLabel = (d: string) =>
    new Date(d).toLocaleDateString("en-NG", { weekday: "short" });

  const currentMap: Record<string, number> = {};
  (revenueData.data || []).forEach((sale) => {
    const day = dayLabel(sale.created_at);
    currentMap[day] = (currentMap[day] || 0) + sale.total;
  });
  const prevMap: Record<string, number> = {};
  (prevRevenueData.data || []).forEach((sale) => {
    const day = dayLabel(sale.created_at);
    prevMap[day] = (prevMap[day] || 0) + sale.total;
  });
  const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const chartData: SalesChartPoint[] = dayOrder
    .filter((d) => currentMap[d] !== undefined || prevMap[d] !== undefined)
    .map((d) => ({
      label: d,
      value: currentMap[d] || 0,
      previous: prevMap[d] || 0,
    }));

  const weeklyDelta =
    prevWeeklyRevenue > 0
      ? ((weeklyRevenue - prevWeeklyRevenue) / prevWeeklyRevenue) * 100
      : null;

  return {
    stats: {
      today_sales: todaySales.data?.length || 0,
      today_revenue: todayRevenue,
      weekly_revenue: weeklyRevenue,
      weekly_delta: weeklyDelta,
      monthly_revenue: monthlyRevenue,
      total_products: products.data?.length || 0,
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
      pending_vendor_debts: pendingDebt,
      pending_transfers: pendingTransfers.data?.length || 0,
    },
    recentSales: recentSales.data || [],
    chartData,
  };
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [range, setRange] = useState<RangeKey>("week");
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardData,
    refetchInterval: 60000,
    retry: 2,
  });

  // Auto-refresh the moment a cashier's device syncs its offline queue to
  // Supabase — the owner doesn't need to do anything for this to happen.
  useRealtimeSync(["sales", "inventory"], user?.organization_id, ["dashboard"]);

  const stats = data?.stats;
  const recentSales = data?.recentSales || [];
  const chartData = data?.chartData || [];

  const revenueForRange = useMemo(() => {
    if (!stats) return 0;
    if (range === "today") return stats.today_revenue;
    if (range === "month") return stats.monthly_revenue;
    return stats.weekly_revenue;
  }, [stats, range]);

  const firstName = user?.full_name?.split(" ")[0] ?? "";
  const greeting = t.dashboard.greeting
    .replace("{time}", getGreeting(t))
    .replace("{name}", firstName);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="tt-page-title">{greeting}</h1>
          <p className="tt-muted text-sm mt-1">{t.dashboard.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1.5" strokeWidth={1.75} />
            Export
          </Button>
          <Button size="sm" asChild>
            <Link href="/pos">
              <ShoppingCart className="h-4 w-4 mr-1.5" strokeWidth={1.75} />
              Open POS
            </Link>
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorState
          body={
            error instanceof Error
              ? error.message
              : "We couldn't load your dashboard data."
          }
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {/* Range filter */}
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "today", label: "Today" },
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
            ]}
          />

          {/* Stats Grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={
                range === "today"
                  ? t.dashboard.today_sales
                  : range === "month"
                    ? t.dashboard.monthly_revenue
                    : t.dashboard.weekly_revenue
              }
              value={formatCurrency(revenueForRange)}
              delta={
                range === "week" && stats?.weekly_delta != null
                  ? `${stats.weekly_delta >= 0 ? "+" : ""}${stats.weekly_delta.toFixed(1)}%`
                  : undefined
              }
              deltaDir={
                stats?.weekly_delta != null
                  ? stats.weekly_delta >= 0
                    ? "up"
                    : "down"
                  : undefined
              }
              sub={range === "week" ? "vs. last week" : undefined}
              icon={TrendingUp}
              loading={isLoading}
            />
            <StatCard
              label={t.dashboard.today_sales}
              value={stats ? stats.today_sales : 0}
              sub={formatCurrency(stats?.today_revenue || 0)}
              icon={ShoppingCart}
              loading={isLoading}
            />
            <StatCard
              label={t.dashboard.total_products}
              value={stats?.total_products || 0}
              icon={Package}
              loading={isLoading}
            />
            <StatCard
              label={t.dashboard.pending_debts}
              value={formatCurrency(stats?.pending_vendor_debts || 0)}
              sub={t.dashboard.awaiting_payment}
              icon={Users}
              loading={isLoading}
            />
          </div>

          {/* Alert Row */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
            <StatCard
              label={t.dashboard.low_stock}
              value={stats?.low_stock_count || 0}
              sub={t.dashboard.need_restocking}
              icon={AlertTriangle}
              loading={isLoading}
            />
            <StatCard
              label={t.dashboard.out_of_stock}
              value={stats?.out_of_stock_count || 0}
              sub={t.dashboard.requires_attention}
              icon={XCircle}
              loading={isLoading}
            />
          </div>

          {/* Charts Row */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Sales Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="tt-eyebrow mb-1">Sales overview</div>
                <CardTitle className="tt-section-title">
                  {t.dashboard.revenue_chart}
                </CardTitle>
                <CardDescription>{t.dashboard.revenue_chart_desc}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : chartData.length === 0 ? (
                  <EmptyState
                    icon={BarChart3}
                    title="No sales yet this week"
                    body="Once sales come in, your revenue trend will show up here."
                  />
                ) : (
                  <SalesChart data={chartData} height={260} />
                )}
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <div className="tt-eyebrow mb-1">Live activity</div>
                <CardTitle className="tt-section-title text-base">
                  {t.dashboard.recent_transactions}
                </CardTitle>
                <CardDescription>
                  {t.dashboard.recent_transactions_desc}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="space-y-3 p-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-1">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentSales.length === 0 ? (
                  <EmptyState
                    icon={ShoppingCart}
                    title={t.dashboard.no_sales_today}
                    body="Sales will appear here as soon as your team starts ringing them up."
                  />
                ) : (
                  <div className="divide-y">
                    {recentSales.slice(0, 6).map((sale: Partial<Sale>) => (
                      <div
                        key={sale.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div
                          className="tt-avatar h-8 w-8 text-xs"
                          style={{
                            background:
                              "color-mix(in oklch, var(--c-primary), transparent 88%)",
                            color: "var(--c-primary)",
                          }}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {sale.invoice_number}
                          </p>
                          <p className="text-xs tt-muted">
                            {sale.created_at
                              ? formatRelativeTime(sale.created_at)
                              : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tt-tabular">
                            {formatCurrency(sale.total || 0)}
                          </p>
                          <Badge
                            variant={
                              sale.status === "completed" ? "success" : "pending"
                            }
                            className="text-xs py-0"
                          >
                            {sale.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="tt-section-title text-base">
                {t.dashboard.quick_actions}
              </CardTitle>
              <CardDescription>{t.dashboard.quick_actions_desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { href: "/pos", icon: ShoppingCart, label: t.dashboard.new_sale },
                  { href: "/inventory", icon: Package, label: t.dashboard.stock_in },
                  { href: "/transfers", icon: ArrowLeftRight, label: t.nav.transfers },
                  { href: "/reports", icon: TrendingUp, label: t.nav.reports },
                ].map(({ href, icon: Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border p-4 text-center transition-colors hover:bg-accent group"
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] transition-transform group-hover:scale-105"
                      style={{
                        background:
                          "color-mix(in oklch, var(--c-primary), transparent 90%)",
                        color: "var(--c-primary)",
                      }}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Manual refresh, kept out of the header row so it doesn't
              compete visually with the primary "Open POS" action. */}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="tt-muted"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`}
                strokeWidth={1.75}
              />
              Refresh
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function getGreeting(t: ReturnType<typeof useI18n>["t"]) {
  const hour = new Date().getHours();
  if (hour < 12) return t.dashboard.morning;
  if (hour < 17) return t.dashboard.afternoon;
  return t.dashboard.evening;
}
