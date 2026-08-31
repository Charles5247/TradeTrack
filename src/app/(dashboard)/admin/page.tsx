"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Eye,
  Ban,
  BarChart3,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store";
import { formatCurrency } from "@/lib/utils/format";
import { useI18n } from "@/i18n";

const supabase = createClient();

// ─── KPI Card Component ───────────────────────────────────────────────────────
interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
  color?: "blue" | "green" | "orange" | "purple" | "red";
  loading?: boolean;
}

function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = "blue",
  loading,
}: KPICardProps) {
  const colorTokenMap: Record<string, string> = {
    blue: "var(--c-info)",
    green: "var(--c-success)",
    orange: "var(--c-warn)",
    purple: "var(--c-primary)",
    red: "var(--c-danger)",
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  const tone = colorTokenMap[color];
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium tt-muted">{title}</p>
          <div
            className="p-2 rounded-lg"
            style={{ background: `color-mix(in oklch, ${tone}, transparent 88%)`, color: tone }}
          >
            {icon}
          </div>
        </div>
        <div className="space-y-1">
          <p className="tt-stat-value tt-tabular">{value}</p>
          {subtitle && (
            <p className="text-xs tt-muted">{subtitle}</p>
          )}
          {trend !== undefined && (
            <p
              className="text-xs font-medium tt-tabular"
              style={{ color: trend >= 0 ? "var(--c-success)" : "var(--c-danger)" }}
            >
              {trend >= 0 ? "\u2191" : "\u2193"} {Math.abs(trend)}% from last month
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    {
      variant: "default" | "secondary" | "destructive" | "outline";
      label: string;
    }
  > = {
    active: { variant: "default", label: "Active" },
    pending: { variant: "secondary", label: "Pending" },
    suspended: { variant: "destructive", label: "Suspended" },
    deactivated: { variant: "outline", label: "Deactivated" },
    paid: { variant: "default", label: "Paid" },
    unpaid: { variant: "secondary", label: "Unpaid" },
    cancelled: { variant: "destructive", label: "Cancelled" },
  };
  const cfg = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MerchantRow {
  id: string;
  business_name: string;
  status: string;
  verification_status: string;
  contact_email: string;
  onboarding_completed: boolean;
  created_at: string;
}

interface AuditLogRow {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
  user_id: string;
  metadata: Record<string, unknown> | null;
}

interface RevenuePoint {
  month: string;
  revenue: number;
  invoices: number;
}

interface AcquisitionPoint {
  month: string;
  merchants: number;
  active: number;
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Access guard ─────────────────────────────────────────────────────────
  // Platform Owner dashboard: TradeTrack's own cross-org staff only.
  // A merchant's business_owner account never sees this screen (it has no
  // write access into any individual merchant's operational data).
  const isOwnerOrAdmin = user?.role === "platform_owner";

  // ── Merchants query ───────────────────────────────────────────────────────
  const { data: merchants, isLoading: merchantsLoading } = useQuery({
    queryKey: ["admin-merchants", refreshKey],
    queryFn: async (): Promise<MerchantRow[]> => {
      const { data, error } = await supabase
        .from("merchants")
        .select(
          "id, business_name, status, verification_status, contact_email, onboarding_completed, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("merchants query error:", error);
        return [];
      }
      return data as any as MerchantRow[];
    },
    enabled: isOwnerOrAdmin,
  });

  // ── Subscriptions / revenue query ─────────────────────────────────────────
  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["admin-revenue", refreshKey],
    queryFn: async (): Promise<RevenuePoint[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("amount, status, created_at")
        .eq("status", "paid")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        console.error("invoices query error:", error);
        return [];
      }
      // Group by month
      const monthMap = new Map<string, { revenue: number; invoices: number }>();
      ((data as any[]) ?? []).forEach(
        (inv: { created_at: string; amount: number }) => {
          const month = new Date(inv.created_at).toLocaleString("en", {
            month: "short",
            year: "2-digit",
          });
          const existing = monthMap.get(month) ?? { revenue: 0, invoices: 0 };
          monthMap.set(month, {
            revenue: existing.revenue + inv.amount,
            invoices: existing.invoices + 1,
          });
        },
      );
      return Array.from(monthMap.entries()).map(([month, v]) => ({
        month,
        ...v,
      }));
    },
    enabled: isOwnerOrAdmin,
  });

  // ── Acquisition query ─────────────────────────────────────────────────────
  const { data: acquisitionData, isLoading: acquisitionLoading } = useQuery({
    queryKey: ["admin-acquisition", refreshKey],
    queryFn: async (): Promise<AcquisitionPoint[]> => {
      const { data, error } = await supabase
        .from("merchants")
        .select("created_at, status")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        console.error("merchant acquisition query error:", error);
        return [];
      }
      const monthMap = new Map<string, { merchants: number; active: number }>();
      ((data as any[]) ?? []).forEach(
        (m: { created_at: string; status: string }) => {
          const month = new Date(m.created_at).toLocaleString("en", {
            month: "short",
            year: "2-digit",
          });
          const existing = monthMap.get(month) ?? { merchants: 0, active: 0 };
          monthMap.set(month, {
            merchants: existing.merchants + 1,
            active: existing.active + (m.status === "active" ? 1 : 0),
          });
        },
      );
      return Array.from(monthMap.entries()).map(([month, v]) => ({
        month,
        ...v,
      }));
    },
    enabled: isOwnerOrAdmin,
  });

  // ── Audit logs stream ─────────────────────────────────────────────────────
  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ["admin-audit-stream", refreshKey],
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(
          "id, action, resource_type, created_at, user_id, old_values, new_values",
        )
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        console.error("audit_logs query error:", error);
        return [];
      }
      return data as any as AuditLogRow[];
    },
    enabled: isOwnerOrAdmin,
    refetchInterval: 30000, // refresh every 30s
  });

  // ── Compute KPIs ──────────────────────────────────────────────────────────
  const totalMerchants = merchants?.length ?? 0;
  const activeMerchants =
    merchants?.filter((m) => m.status === "active").length ?? 0;
  const pendingMerchants =
    merchants?.filter((m) => m.status === "pending").length ?? 0;
  const suspendedMerchants =
    merchants?.filter((m) => m.status === "suspended").length ?? 0;
  const mrr = revenueData?.slice(-1)[0]?.revenue ?? 0;
  const arr = mrr * 12;
  const totalRevenue = revenueData?.reduce((s, r) => s + r.revenue, 0) ?? 0;

  // ── Access denied ─────────────────────────────────────────────────────────
  if (!isOwnerOrAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div
            className="p-4 rounded-full inline-block"
            style={{ background: "color-mix(in oklch, var(--c-danger), transparent 90%)" }}
          >
            <ShieldCheck className="h-12 w-12" style={{ color: "var(--c-danger)" }} strokeWidth={1.75} />
          </div>
          <h2 className="tt-head text-xl">{t.admin.access_restricted}</h2>
          <p className="tt-muted max-w-sm">
            {t.admin.access_restricted_desc}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* -- Header -- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="tt-page-title flex items-center gap-2">
            <BarChart3 className="h-6 w-6" style={{ color: "var(--c-primary)" }} strokeWidth={1.75} />
            {t.admin.title}
          </h1>
          <p className="tt-muted mt-1">{t.admin.subtitle}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
          {t.admin.refresh}
        </Button>
      </div>

      {/* -- System Health Banner -- */}
      <div
        className="flex items-center gap-2 p-3 rounded-lg border"
        style={{
          background: "color-mix(in oklch, var(--c-success), transparent 92%)",
          borderColor: "color-mix(in oklch, var(--c-success), transparent 70%)",
        }}
      >
        <CheckCircle className="h-4 w-4" style={{ color: "var(--c-success)" }} strokeWidth={1.75} />
        <span className="text-sm font-medium" style={{ color: "var(--c-success)" }}>
          {t.admin.systems_operational}
        </span>
        <span className="text-xs ml-auto tt-tabular" style={{ color: "var(--c-success)" }}>
          {t.admin.last_checked}: {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title={t.admin.total_merchants}
          value={totalMerchants}
          subtitle={`${activeMerchants} ${t.admin.active.toLowerCase()} · ${pendingMerchants} ${t.admin.pending.toLowerCase()}`}
          icon={<Building2 className="h-4 w-4" />}
          color="blue"
          loading={merchantsLoading}
        />
        <KPICard
          title={t.admin.active_subscriptions}
          value={activeMerchants}
          subtitle={`${suspendedMerchants} ${t.admin.suspended.toLowerCase()}`}
          icon={<Users className="h-4 w-4" />}
          color="green"
          loading={merchantsLoading}
        />
        <KPICard
          title={t.admin.mrr}
          value={formatCurrency(mrr)}
          subtitle={t.admin.monthly_recurring_revenue}
          icon={<DollarSign className="h-4 w-4" />}
          trend={8.3}
          color="purple"
          loading={revenueLoading}
        />
        <KPICard
          title={t.admin.arr}
          value={formatCurrency(arr)}
          subtitle={`${t.admin.total_collected}: ${formatCurrency(totalRevenue)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          trend={12.1}
          color="orange"
          loading={revenueLoading}
        />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">{t.admin.overview}</TabsTrigger>
          <TabsTrigger value="merchants">{t.admin.merchants}</TabsTrigger>
          <TabsTrigger value="revenue">{t.admin.revenue}</TabsTrigger>
          <TabsTrigger value="audit">{t.admin.audit_log}</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Growth AreaChart */}
            <Card>
              <CardHeader>
                <CardTitle>{t.admin.revenue_growth}</CardTitle>
                <CardDescription>{t.admin.revenue_growth_desc}</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (revenueData ?? []).length === 0 ? (
                  <EmptyChartState
                    title={t.admin.no_revenue_title}
                    description={t.admin.no_revenue_desc}
                    disclaimer={t.admin.no_data_disclaimer}
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={revenueData ?? []}>
                      <defs>
                        <linearGradient
                          id="revenueGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#6366f1"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#6366f1"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="opacity-40"
                      />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={(v: number) =>
                          `₦${(v / 1000).toFixed(0)}k`
                        }
                        tick={{ fontSize: 11 }}
                      />
                      {/* @ts-ignore */}
                      <Tooltip
                        formatter={(v: any) => [
                          formatCurrency(v as number),
                          "Revenue",
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fill="url(#revenueGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Merchant Acquisition BarChart */}
            <Card>
              <CardHeader>
                <CardTitle>{t.admin.merchant_acquisition}</CardTitle>
                <CardDescription>
                  {t.admin.merchant_acquisition_desc}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {acquisitionLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (acquisitionData ?? []).length === 0 ? (
                  <EmptyChartState
                    title={t.admin.no_merchant_data_title}
                    description={t.admin.no_merchant_data_desc}
                    disclaimer={t.admin.no_data_disclaimer}
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={acquisitionData ?? []}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="opacity-40"
                      />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey="merchants"
                        name="Total"
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="active"
                        name="Active"
                        fill="#22c55e"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Status overview cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatusSummaryCard
              label={t.admin.active}
              count={activeMerchants}
              icon={CheckCircle}
              tone="var(--c-success)"
            />
            <StatusSummaryCard
              label={t.admin.pending}
              count={pendingMerchants}
              icon={Clock}
              tone="var(--c-warn)"
            />
            <StatusSummaryCard
              label={t.admin.suspended}
              count={suspendedMerchants}
              icon={Ban}
              tone="var(--c-danger)"
            />
            <StatusSummaryCard
              label={t.admin.onboarded}
              count={
                merchants?.filter((m) => m.onboarding_completed).length ?? 0
              }
              icon={Activity}
              tone="var(--c-info)"
            />
          </div>
        </TabsContent>

        {/* ── MERCHANTS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="merchants">
          <Card>
            <CardHeader>
              <CardTitle>{t.admin.all_merchants}</CardTitle>
              <CardDescription>
                {t.admin.merchant_list_desc} ({totalMerchants} total)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {merchantsLoading ? (
                <LoadingState
                  rows={5}
                  columnLabels={[
                    t.admin.business,
                    t.admin.email,
                    t.admin.status,
                    t.admin.verification,
                    t.admin.onboarded,
                    t.admin.joined,
                    t.admin.actions,
                  ]}
                />
              ) : (merchants ?? []).length === 0 ? (
                <EmptyState icon={Building2} title={t.admin.no_merchants} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.admin.business}</TableHead>
                        <TableHead>{t.admin.email}</TableHead>
                        <TableHead>{t.admin.status}</TableHead>
                        <TableHead>{t.admin.verification}</TableHead>
                        <TableHead>{t.admin.onboarded}</TableHead>
                        <TableHead>{t.admin.joined}</TableHead>
                        <TableHead className="text-right">
                          {t.admin.actions}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(merchants ?? []).map((merchant) => (
                          <TableRow key={merchant.id}>
                            <TableCell className="font-medium">
                              {merchant.business_name}
                            </TableCell>
                            <TableCell className="text-sm tt-muted">
                              {merchant.contact_email}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={merchant.status} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                status={merchant.verification_status}
                              />
                            </TableCell>
                            <TableCell>
                              {merchant.onboarding_completed ? (
                                <span className="text-sm" style={{ color: "var(--c-success)" }}>
                                  ✓ {t.admin.complete}
                                </span>
                              ) : (
                                <span className="text-sm" style={{ color: "var(--c-warn)" }}>
                                  {t.admin.in_progress}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm tt-muted">
                              {new Date(
                                merchant.created_at,
                              ).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── REVENUE TAB ───────────────────────────────────────────────── */}
        <TabsContent value="revenue" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm tt-muted mb-1">
                  {t.admin.total_revenue}
                </p>
                <p className="text-2xl font-bold tt-tabular" style={{ color: "var(--c-success)" }}>
                  {formatCurrency(totalRevenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm tt-muted mb-1">
                  {t.admin.current_mrr}
                </p>
                <p className="text-2xl font-bold tt-tabular" style={{ color: "var(--c-primary)" }}>
                  {formatCurrency(mrr)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm tt-muted mb-1">
                  {t.admin.arr_projection}
                </p>
                <p className="text-2xl font-bold tt-tabular" style={{ color: "var(--c-info)" }}>
                  {formatCurrency(arr)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t.admin.revenue_trend}</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : (revenueData ?? []).length === 0 ? (
                <EmptyChartState
                  title={t.admin.no_revenue_title}
                  description={t.admin.no_revenue_desc}
                  disclaimer={t.admin.no_data_disclaimer}
                />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={revenueData ?? []}>
                    <defs>
                      <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#22c55e"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#22c55e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="opacity-40"
                    />
                    <XAxis dataKey="month" />
                    <YAxis
                      tickFormatter={(v: number) =>
                        `₦${(v / 1000).toFixed(0)}k`
                      }
                    />
                    {/* @ts-ignore */}
                    <Tooltip
                      formatter={(v: any) => [
                        formatCurrency(v as number),
                        "Revenue",
                      ]}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue (NGN)"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#revGrad2)"
                    />
                    <Area
                      type="monotone"
                      dataKey="invoices"
                      name="Invoices"
                      stroke="#6366f1"
                      strokeWidth={1.5}
                      fill="none"
                      strokeDasharray="5 5"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AUDIT LOG TAB ─────────────────────────────────────────────── */}
        <TabsContent value="audit">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t.admin.live_audit_stream}</CardTitle>
                <CardDescription>{t.admin.live_audit_desc}</CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: "var(--c-success)" }}
                  ></span>
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--c-success)" }}></span>
                </span>
                <span className="text-xs tt-muted ml-1">
                  {t.admin.live}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {(auditLogs ?? []).length === 0 ? (
                    <p className="text-center py-10 tt-muted">
                      {t.admin.no_audit_events}
                    </p>
                  ) : (
                    (auditLogs ?? []).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors border border-border/50"
                      >
                        <div className="p-1.5 bg-primary/10 rounded">
                          <Activity className="h-3 w-3" style={{ color: "var(--c-primary)" }} strokeWidth={1.75} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            <span style={{ color: "var(--c-primary)" }}>{log.action}</span>
                            {log.resource_type && (
                              <span className="tt-muted">
                                {" "}
                                · {log.resource_type}
                              </span>
                            )}
                          </p>
                          <p className="text-xs tt-muted truncate">
                            User: {log.user_id?.slice(0, 8)}…
                          </p>
                        </div>
                        <div className="text-xs tt-muted whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Status Summary Card ──────────────────────────────────────────────────────
function StatusSummaryCard({
  label,
  count,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className="inline-flex p-2 rounded-lg mb-2"
          style={{ background: `color-mix(in oklch, ${tone}, transparent 88%)`, color: tone }}
        >
          <Icon size={16} strokeWidth={1.75} />
        </div>
        <p className="tt-stat-value tt-tabular">{count}</p>
        <p className="text-sm tt-muted">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Empty Chart State ─────────────────────────────────────────────────────────
// Shown instead of a chart when there is genuinely no data in the database yet.
// This is intentionally NOT populated with mock/simulated data - an honest
// empty state is preferable to a misleading fake chart.
function EmptyChartState({
  title,
  description,
  disclaimer,
}: {
  title: string;
  description: string;
  disclaimer?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
      <div className="p-3 bg-muted rounded-full mb-3">
        <BarChart3 className="h-8 w-8 tt-muted" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs tt-muted mt-1 max-w-xs">
        {description}
      </p>
      {disclaimer && (
        <p className="text-[10px] tt-faint mt-3 uppercase tracking-wide">
          {disclaimer}
        </p>
      )}
    </div>
  );
}
