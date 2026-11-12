"use client";
import { TranslatedText, useCopy } from '@/i18n/text';


import React, { useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
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
import { ErrorState } from "@/components/ui/error-state";
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
  organization_id: string;
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

interface MerchantHealth {
  organizationId: string;
  name: string;
  contactEmail: string;
  plan: 'Paid' | 'Trial' | 'Expired or unpaid';
  trialDaysLeft: number | null;
  lastOpenedAt: string | null;
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const copy = useCopy();
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Access guard ─────────────────────────────────────────────────────────
  // Platform Owner dashboard: TracKasuwa's own cross-org staff only.
  // A merchant's business_owner account never sees this screen (it has no
  // write access into any individual merchant's operational data).
  const isOwnerOrAdmin = user?.role === "platform_owner";

  // ── Merchants query ───────────────────────────────────────────────────────
  const { data: merchants, isLoading: merchantsLoading, error: merchantsError } = useQuery({
    queryKey: ["admin-merchants", refreshKey],
    queryFn: async (): Promise<MerchantRow[]> => {
      const { data, error } = await supabase
        .from("merchants")
        .select(
          "id, business_name, status, verification_status, contact_email, onboarding_completed, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data as any as MerchantRow[];
    },
    enabled: isOwnerOrAdmin,
  });

  // ── Subscriptions / revenue query ─────────────────────────────────────────
  const { data: revenueData, isLoading: revenueLoading, error: revenueError } = useQuery({
    queryKey: ["admin-revenue", refreshKey],
    queryFn: async (): Promise<RevenuePoint[]> => {
      const invoices: Array<{ created_at: string; paid_at: string | null; amount: number }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("invoices")
          .select("amount,created_at,paid_at").eq("status", "paid")
          .order("created_at", { ascending: true }).range(offset, offset + 999);
        if (error) throw new Error(error.message);
        invoices.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      // Group by month
      const monthMap = new Map<string, { revenue: number; invoices: number }>();
      invoices.forEach(
        (inv) => {
          const month = new Date(inv.paid_at || inv.created_at).toISOString().slice(0, 7);
          const existing = monthMap.get(month) ?? { revenue: 0, invoices: 0 };
          monthMap.set(month, {
            revenue: existing.revenue + inv.amount,
            invoices: existing.invoices + 1,
          });
        },
      );
      return Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
        month: new Date(`${month}-01T00:00:00Z`).toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" }),
        ...v,
      }));
    },
    enabled: isOwnerOrAdmin,
  });

  // ── Acquisition query ─────────────────────────────────────────────────────
  const { data: acquisitionData, isLoading: acquisitionLoading, error: acquisitionError } = useQuery({
    queryKey: ["admin-acquisition", refreshKey],
    queryFn: async (): Promise<AcquisitionPoint[]> => {
      const merchants: Array<{ created_at: string; status: string }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("merchants")
          .select("created_at,status").order("created_at", { ascending: true }).range(offset, offset + 999);
        if (error) throw new Error(error.message);
        merchants.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const monthMap = new Map<string, { merchants: number; active: number }>();
      merchants.forEach(
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
  const { data: auditLogs, isLoading: auditLoading, error: auditError } = useQuery({
    queryKey: ["admin-audit-stream", refreshKey],
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(
          "id, action, resource_type, created_at, user_id, old_values, new_values",
        )
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data as any as AuditLogRow[];
    },
    enabled: isOwnerOrAdmin,
    refetchInterval: 30000, // refresh every 30s
  });

  // ── Compute KPIs ──────────────────────────────────────────────────────────
  const { data: merchantCounts, isLoading: countsLoading, error: countsError } = useQuery({
    queryKey: ["admin-merchant-counts", refreshKey],
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from("merchants").select("id", { count: "exact", head: true }),
        supabase.from("merchants").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("merchants").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("merchants").select("id", { count: "exact", head: true }).eq("status", "suspended"),
        supabase.from("merchants").select("id", { count: "exact", head: true }).eq("onboarding_completed", true),
      ]);
      const error = results.find(result => result.error)?.error;
      if (error) throw new Error(error.message);
      return { total: results[0].count ?? 0, active: results[1].count ?? 0, pending: results[2].count ?? 0, suspended: results[3].count ?? 0, onboarded: results[4].count ?? 0 };
    },
    enabled: isOwnerOrAdmin,
  });
  const { data: merchantHealth = [], isLoading: healthLoading, error: healthError } = useQuery({
    queryKey: ['platform-merchant-health', refreshKey], enabled: isOwnerOrAdmin,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MerchantHealth[]> => {
      const loadAll = async <T,>(builder: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> => {
        const rows: T[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await builder.range(offset, offset + 499);
          if (error) throw new Error(error.message);
          rows.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        return rows;
      };
      const [merchantRows, organizations, subscriptions, activity] = await Promise.all([
        loadAll(supabase.from('merchants').select('organization_id,business_name,contact_email').order('created_at')),
        loadAll(supabase.from('organizations').select('id,subscription_status,trial_ends_at').order('created_at')),
        loadAll(supabase.from('subscriptions').select('organization_id,status,expires_at').eq('status', 'active').order('expires_at', { ascending: false })),
        loadAll(supabase.from('merchant_app_activity' as never).select('organization_id,last_opened_at').order('organization_id')),
      ]);
      const orgById = new Map((organizations as Array<{ id: string; subscription_status: string; trial_ends_at: string | null }>).map(org => [org.id, org]));
      const paidOrgs = new Set((subscriptions as Array<{ organization_id: string; expires_at: string }>).filter(sub => new Date(sub.expires_at).getTime() > Date.now()).map(sub => sub.organization_id));
      const openedByOrg = new Map((activity as Array<{ organization_id: string; last_opened_at: string }>).map(row => [row.organization_id, row.last_opened_at]));
      return (merchantRows as Array<{ organization_id: string; business_name: string; contact_email: string }>).map(merchant => {
        const org = orgById.get(merchant.organization_id);
        const trialEnd = org?.trial_ends_at ? new Date(org.trial_ends_at).getTime() : 0;
        const trialDaysLeft = org?.subscription_status === 'trial' && trialEnd > Date.now()
          ? Math.ceil((trialEnd - Date.now()) / 86_400_000) : null;
        return {
          organizationId: merchant.organization_id,
          name: merchant.business_name,
          contactEmail: merchant.contact_email,
          plan: paidOrgs.has(merchant.organization_id) ? 'Paid' : trialDaysLeft !== null ? 'Trial' : 'Expired or unpaid',
          trialDaysLeft,
          lastOpenedAt: openedByOrg.get(merchant.organization_id) ?? null,
        };
      });
    },
  });
  const { data: openSupportCount = 0 } = useQuery({
    queryKey: ['platform-open-support', refreshKey], enabled: isOwnerOrAdmin,
    queryFn: async () => {
      const response = await fetch('/api/support/cases', { cache: 'no-store' });
      if (!response.ok) throw new Error('Support queue unavailable');
      const result = await response.json();
      return result.openCount as number;
    }, refetchInterval: 30000,
  });
  const { data: attention, error: attentionError } = useQuery({
    queryKey: ['platform-attention', refreshKey], enabled: isOwnerOrAdmin,
    queryFn: async () => {
      const now = new Date();
      const inSevenDays = new Date(now.getTime() + 7 * 86400000).toISOString();
      const lastSevenDays = new Date(now.getTime() - 7 * 86400000).toISOString();
      const [verification, expiring, failedPayments] = await Promise.all([
        supabase.from('merchants').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true })
          .in('status', ['active', 'trial']).gte('expires_at', now.toISOString()).lte('expires_at', inSevenDays),
        supabase.from('payment_transactions').select('id', { count: 'exact', head: true })
          .eq('status', 'failed').gte('created_at', lastSevenDays),
      ]);
      const error = [verification, expiring, failedPayments].find(result => result.error)?.error;
      if (error) throw error;
      return { verification: verification.count ?? 0, expiring: expiring.count ?? 0, failedPayments: failedPayments.count ?? 0 };
    }, refetchInterval: 60000,
  });
  const { data: estimatedMRR = 0, error: mrrError } = useQuery({
    queryKey: ['platform-estimated-mrr', refreshKey], enabled: isOwnerOrAdmin,
    queryFn: async () => {
      const allSubscriptions: Array<{ organization_id: string; plan_id: string; billing_cycle: string | null; created_at: string }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('subscriptions')
          .select('organization_id,plan_id,billing_cycle,created_at').eq('status', 'active')
          .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).range(offset, offset + 999);
        if (error) throw error;
        allSubscriptions.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const { data: plans, error } = await supabase.from('subscription_plans').select('id,price');
      if (error) throw error;
      const planPrice = new Map((plans || []).map(plan => [plan.id, plan.price]));
      const counted = new Set<string>();
      return allSubscriptions.reduce((total, subscription) => {
        if (counted.has(subscription.organization_id)) return total;
        counted.add(subscription.organization_id);
        const price = planPrice.get(subscription.plan_id) || 0;
        return total + (subscription.billing_cycle === 'yearly' ? price * 0.8 : price);
      }, 0);
    },
  });
  const totalMerchants = merchantCounts?.total ?? 0;
  const activeMerchants = merchantCounts?.active ?? 0;
  const pendingMerchants = merchantCounts?.pending ?? 0;
  const suspendedMerchants = merchantCounts?.suspended ?? 0;
  const latestCollections = revenueData?.slice(-1)[0]?.revenue ?? 0;
  const estimatedARR = estimatedMRR * 12;
  const totalRevenue = revenueData?.reduce((s, r) => s + r.revenue, 0) ?? 0;
  const paidMerchants = merchantHealth.filter(merchant => merchant.plan === 'Paid').length;
  const trialMerchants = merchantHealth.filter(merchant => merchant.plan === 'Trial').length;
  const liveMerchants = merchantHealth.filter(merchant => merchant.lastOpenedAt && Date.now() - new Date(merchant.lastOpenedAt).getTime() < 5 * 60_000).length;
  const activeSevenDays = merchantHealth.filter(merchant => merchant.lastOpenedAt && Date.now() - new Date(merchant.lastOpenedAt).getTime() < 7 * 86_400_000).length;

  // ── Access denied ─────────────────────────────────────────────────────────
  if (!isOwnerOrAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div
            className="p-4 rounded-full inline-block"
            style={{
              background:
                "color-mix(in oklch, var(--c-danger), transparent 90%)",
            }}
          >
            <ShieldCheck
              className="h-12 w-12"
              style={{ color: "var(--c-danger)" }}
              strokeWidth={1.75}
            />
          </div>
          <h2 className="tt-head text-xl">{t.admin.access_restricted}</h2>
          <p className="tt-muted max-w-sm">{t.admin.access_restricted_desc}</p>
        </div>
      </div>
    );
  }

  const loadError = merchantsError || countsError || revenueError || acquisitionError || auditError || attentionError || mrrError || healthError;
  if (loadError) return <div className="space-y-6"><h1 className="tt-page-title"><TranslatedText text={"Platform overview"} /></h1><ErrorState title={copy("Could not load platform data")} body={loadError.message} onRetry={() => setRefreshKey(k => k + 1)} /></div>;

  return (
    <div className="space-y-6">
      {/* -- Header -- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="tt-page-title flex items-center gap-2">
            <BarChart3
              className="h-6 w-6"
              style={{ color: "var(--c-primary)" }}
              strokeWidth={1.75}
            /><TranslatedText text={"Platform overview"} /></h1>
          <p className="tt-muted mt-1"><TranslatedText text={"Merchant operations, subscription collections, and platform activity."} /></p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={copy("Total merchants")} value={totalMerchants} sub="Across the platform" icon={Building2} loading={countsLoading} />
        <StatCard label={copy("Active merchants")} value={activeMerchants} sub="Across the platform" icon={Users} loading={countsLoading} />
        <StatCard label={copy("Latest month collected")} value={formatCurrency(latestCollections)} sub={revenueData?.slice(-1)[0]?.month ?? 'No paid invoices loaded'} icon={DollarSign} loading={revenueLoading} />
        <StatCard label={copy("Pending merchants")} value={pendingMerchants} sub="Awaiting review" icon={Clock} loading={countsLoading} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Paid merchants" value={paidMerchants} sub="Current paid subscription" icon={DollarSign} loading={healthLoading} />
        <StatCard label="Trial merchants" value={trialMerchants} sub="Trial still running" icon={Clock} loading={healthLoading} />
        <StatCard label="Live now" value={liveMerchants} sub="Opened in the past 5 minutes" icon={Activity} loading={healthLoading} />
        <StatCard label="Active in 7 days" value={activeSevenDays} sub="Opened in the past 7 days" icon={Users} loading={healthLoading} />
      </div>
      <Card>
        <CardHeader><CardTitle>Merchant subscriptions and app activity</CardTitle><CardDescription>Activity tracking starts when merchants open the updated app online.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[{ name: 'Paid', count: paidMerchants }, { name: 'Trial', count: trialMerchants }, { name: 'Live now', count: liveMerchants }, { name: 'Active 7 days', count: activeSevenDays }]}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="var(--c-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="max-h-96 overflow-auto">
            <Table><TableHeader><TableRow><TableHead>Merchant</TableHead><TableHead>Subscription</TableHead><TableHead>Trial left</TableHead><TableHead>Last opened</TableHead><TableHead>Notice</TableHead></TableRow></TableHeader>
              <TableBody>{merchantHealth.map(merchant => <TableRow key={merchant.organizationId}>
                <TableCell><div className="font-medium">{merchant.name}</div><div className="text-xs tt-muted">{merchant.contactEmail}</div></TableCell>
                <TableCell>{merchant.plan}</TableCell><TableCell>{merchant.trialDaysLeft === null ? '—' : `${merchant.trialDaysLeft} day(s)`}</TableCell>
                <TableCell>{merchant.lastOpenedAt ? new Date(merchant.lastOpenedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }) : 'No activity recorded yet'}</TableCell>
                <TableCell>{merchant.plan === 'Trial' && merchant.trialDaysLeft !== null && merchant.trialDaysLeft <= 7 && merchant.contactEmail
                  ? <a className="text-primary underline" href={`mailto:${merchant.contactEmail}?subject=${encodeURIComponent('Your Trackasuwa trial is ending soon')}`}>Email notice</a> : '—'}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/support" className="tt-card-flat flex min-h-20 items-center gap-4 rounded-[var(--radius-lg)] border border-border p-4 transition-colors hover:bg-accent">
          <AlertTriangle className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
          <div><p className="font-semibold">Support queue · {openSupportCount} open</p><p className="text-sm tt-muted">Merchant reports and cashier sync failures</p></div>
        </Link>
        <Link href="/merchants" className="tt-card-flat flex min-h-20 items-center gap-4 rounded-[var(--radius-lg)] border border-border p-4 transition-colors hover:bg-accent">
          <Building2 className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
          <div><p className="font-semibold"><TranslatedText text={"Manage merchants"} /></p><p className="text-sm tt-muted"><TranslatedText text={"Onboarding, verification, and account access"} /></p></div>
        </Link>
        <Link href="/subscriptions" className="tt-card-flat flex min-h-20 items-center gap-4 rounded-[var(--radius-lg)] border border-border p-4 transition-colors hover:bg-accent">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
          <div><p className="font-semibold"><TranslatedText text={"Manage subscription plans"} /></p><p className="text-sm tt-muted"><TranslatedText text={"Platform pricing, features, and usage limits"} /></p></div>
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/merchants" className="tt-card-flat rounded-[var(--radius-lg)] border border-border p-4"><p className="text-sm tt-muted">Awaiting verification</p><p className="text-2xl font-semibold">{attention?.verification ?? '—'}</p></Link>
        <Link href="/merchants" className="tt-card-flat rounded-[var(--radius-lg)] border border-border p-4"><p className="text-sm tt-muted">Subscriptions expiring in 7 days</p><p className="text-2xl font-semibold">{attention?.expiring ?? '—'}</p></Link>
        <Link href="/merchants" className="tt-card-flat rounded-[var(--radius-lg)] border border-border p-4"><p className="text-sm tt-muted">Failed payments in 7 days</p><p className="text-2xl font-semibold">{attention?.failedPayments ?? '—'}</p></Link>
      </div>
      <p className="text-xs tt-muted">Collections use paid invoices. Recurring revenue is estimated from current paid subscriptions and plan prices. Service health is monitored separately.</p>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto [&>button]:min-h-11 [&>button]:shrink-0">
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
                <CardTitle className="tt-section-title">{t.admin.revenue_growth}</CardTitle>
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
                            stopColor="var(--c-primary)"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--c-primary)"
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
                        stroke="var(--c-primary)"
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
                <CardTitle className="tt-section-title">{t.admin.merchant_acquisition}</CardTitle>
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
                        fill="var(--c-primary)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="active"
                        name="Active"
                        fill="var(--c-success)"
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
                merchantCounts?.onboarded ?? 0
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
              <CardTitle className="tt-section-title">{t.admin.all_merchants}</CardTitle>
              <CardDescription>
                {t.admin.merchant_list_desc} ({merchants?.length ?? 0}{" "}<TranslatedText text={"recent records)"} /></CardDescription>
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
                              <span
                                className="text-sm"
                                style={{ color: "var(--c-success)" }}
                              >
                                ✓ {t.admin.complete}
                              </span>
                            ) : (
                              <span
                                className="text-sm"
                                style={{ color: "var(--c-warn)" }}
                              >
                                {t.admin.in_progress}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm tt-muted">
                            {new Date(merchant.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-11 px-3"
                              asChild
                            >
                              <Link href="/merchants"><TranslatedText text={"Manage merchants"} /><Eye className="ml-2 h-4 w-4" /></Link>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm tt-muted mb-1"><TranslatedText text={"Loaded invoice collections"} /></p>
                <p
                  className="text-2xl font-bold tt-tabular"
                  style={{ color: "var(--c-success)" }}
                >
                  {formatCurrency(totalRevenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm tt-muted mb-1"><TranslatedText text={"Latest month collected"} /></p>
                <p
                  className="text-2xl font-bold tt-tabular"
                  style={{ color: "var(--c-primary)" }}
                >
                  {formatCurrency(latestCollections)}
                </p>
              </CardContent>
            </Card>
            <Card><CardContent className="p-6 text-center"><p className="text-sm tt-muted mb-1">Estimated monthly recurring revenue</p><p className="text-2xl font-bold tt-tabular">{formatCurrency(estimatedMRR)}</p></CardContent></Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm tt-muted mb-1">Estimated annual recurring revenue</p>
                <p
                  className="text-2xl font-bold tt-tabular"
                  style={{ color: "var(--c-info)" }}
                >
                  {formatCurrency(estimatedARR)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="tt-section-title">{t.admin.revenue_trend}</CardTitle>
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
                          stopColor="var(--c-success)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--c-success)"
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
                      stroke="var(--c-success)"
                      strokeWidth={2}
                      fill="url(#revGrad2)"
                    />
                    <Area
                      type="monotone"
                      dataKey="invoices"
                      name="Invoices"
                      stroke="var(--c-primary)"
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
                <CardTitle className="tt-section-title">{t.admin.live_audit_stream}</CardTitle>
                <CardDescription>{t.admin.live_audit_desc}</CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: "var(--c-success)" }}
                  ></span>
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ background: "var(--c-success)" }}
                  ></span>
                </span>
                <span className="text-xs tt-muted ml-1">{t.admin.live}</span>
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
                          <Activity
                            className="h-3 w-3"
                            style={{ color: "var(--c-primary)" }}
                            strokeWidth={1.75}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            <span style={{ color: "var(--c-primary)" }}>
                              {log.action}
                            </span>
                            {log.resource_type && (
                              <span className="tt-muted">
                                {" "}
                                · {log.resource_type}
                              </span>
                            )}
                          </p>
                          <p className="text-xs tt-muted truncate"><TranslatedText text={"User:"} />{" "}{log.user_id?.slice(0, 8)}…
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
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    strokeWidth?: number;
  }>;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className="inline-flex p-2 rounded-lg mb-2"
          style={{
            background: `color-mix(in oklch, ${tone}, transparent 88%)`,
            color: tone,
          }}
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
      <p className="text-xs tt-muted mt-1 max-w-xs">{description}</p>
      {disclaimer && (
        <p className="text-[10px] tt-faint mt-3 uppercase tracking-wide">
          {disclaimer}
        </p>
      )}
    </div>
  );
}
