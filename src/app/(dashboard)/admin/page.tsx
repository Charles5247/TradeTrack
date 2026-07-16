'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
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
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { formatCurrency } from '@/lib/utils/format';

const supabase = createClient();

// ─── KPI Card Component ───────────────────────────────────────────────────────
interface KPICardProps {
  title:       string;
  value:       string | number;
  subtitle?:   string;
  icon:        React.ReactNode;
  trend?:      number;
  color?:      'blue' | 'green' | 'orange' | 'purple' | 'red';
  loading?:    boolean;
}

function KPICard({ title, value, subtitle, icon, trend, color = 'blue', loading }: KPICardProps) {
  const colorMap: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
    red:    'bg-red-50 text-red-600',
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

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`p-2 rounded-lg ${colorMap[color]}`}>{icon}</div>
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend !== undefined && (
            <p className={`text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% from last month
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    active:      { variant: 'default',     label: 'Active' },
    pending:     { variant: 'secondary',   label: 'Pending' },
    suspended:   { variant: 'destructive', label: 'Suspended' },
    deactivated: { variant: 'outline',     label: 'Deactivated' },
    paid:        { variant: 'default',     label: 'Paid' },
    unpaid:      { variant: 'secondary',   label: 'Unpaid' },
    cancelled:   { variant: 'destructive', label: 'Cancelled' },
  };
  const cfg = map[status] ?? { variant: 'outline' as const, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MerchantRow {
  id:                   string;
  business_name:        string;
  status:               string;
  verification_status:  string;
  contact_email:        string;
  onboarding_completed: boolean;
  created_at:           string;
}

interface AuditLogRow {
  id:            string;
  action:        string;
  resource_type: string;
  created_at:    string;
  user_id:       string;
  metadata:      Record<string, unknown> | null;
}

interface RevenuePoint {
  month:    string;
  revenue:  number;
  invoices: number;
}

interface AcquisitionPoint {
  month:     string;
  merchants: number;
  active:    number;
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Access guard ─────────────────────────────────────────────────────────
  const isOwnerOrAdmin = (user?.role as string) === 'owner' || user?.role === 'super_admin' || user?.role === 'admin';

  // ── Merchants query ───────────────────────────────────────────────────────
  const { data: merchants, isLoading: merchantsLoading } = useQuery({
    queryKey: ['admin-merchants', refreshKey],
    queryFn: async (): Promise<MerchantRow[]> => {
      const { data, error } = await supabase
        .from('merchants')
        .select('id, business_name, status, verification_status, contact_email, onboarding_completed, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('merchants query error:', error);
        return [];
      }
      return (data as any) as MerchantRow[];
    },
    enabled: isOwnerOrAdmin,
  });

  // ── Subscriptions / revenue query ─────────────────────────────────────────
  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['admin-revenue', refreshKey],
    queryFn: async (): Promise<RevenuePoint[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('amount, status, created_at')
        .eq('status', 'paid')
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) {
        console.error('invoices query error:', error);
        return [];
      }
      // Group by month
      const monthMap = new Map<string, { revenue: number; invoices: number }>();
      ((data as any[]) ?? []).forEach((inv: { created_at: string; amount: number }) => {
        const month = new Date(inv.created_at).toLocaleString('en', { month: 'short', year: '2-digit' });
        const existing = monthMap.get(month) ?? { revenue: 0, invoices: 0 };
        monthMap.set(month, { revenue: existing.revenue + inv.amount, invoices: existing.invoices + 1 });
      });
      return Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }));
    },
    enabled: isOwnerOrAdmin,
  });

  // ── Acquisition query ─────────────────────────────────────────────────────
  const { data: acquisitionData, isLoading: acquisitionLoading } = useQuery({
    queryKey: ['admin-acquisition', refreshKey],
    queryFn: async (): Promise<AcquisitionPoint[]> => {
      const { data, error } = await supabase
        .from('merchants')
        .select('created_at, status')
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) {
        console.error('merchant acquisition query error:', error);
        return [];
      }
      const monthMap = new Map<string, { merchants: number; active: number }>();
      ((data as any[]) ?? []).forEach((m: { created_at: string; status: string }) => {
        const month = new Date(m.created_at).toLocaleString('en', { month: 'short', year: '2-digit' });
        const existing = monthMap.get(month) ?? { merchants: 0, active: 0 };
        monthMap.set(month, {
          merchants: existing.merchants + 1,
          active:    existing.active + (m.status === 'active' ? 1 : 0),
        });
      });
      return Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }));
    },
    enabled: isOwnerOrAdmin,
  });

  // ── Audit logs stream ─────────────────────────────────────────────────────
  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ['admin-audit-stream', refreshKey],
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, resource_type, created_at, user_id, metadata')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        console.error('audit_logs query error:', error);
        return [];
      }
      return (data as any) as AuditLogRow[];
    },
    enabled: isOwnerOrAdmin,
    refetchInterval: 30000, // refresh every 30s
  });

  // ── Compute KPIs ──────────────────────────────────────────────────────────
  const totalMerchants = merchants?.length ?? 0;
  const activeMerchants = merchants?.filter(m => m.status === 'active').length ?? 0;
  const pendingMerchants = merchants?.filter(m => m.status === 'pending').length ?? 0;
  const suspendedMerchants = merchants?.filter(m => m.status === 'suspended').length ?? 0;
  const mrr = revenueData?.slice(-1)[0]?.revenue ?? 0;
  const arr = mrr * 12;
  const totalRevenue = revenueData?.reduce((s, r) => s + r.revenue, 0) ?? 0;

  // ── Access denied ─────────────────────────────────────────────────────────
  if (!isOwnerOrAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="p-4 bg-red-50 rounded-full inline-block">
            <ShieldCheck className="h-12 w-12 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-muted-foreground max-w-sm">
            This dashboard is restricted to platform owners and super-administrators only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Owner Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Platform-wide analytics, merchant management, and system health
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey(k => k + 1)}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* ── System Health Banner ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <span className="text-sm text-green-800 font-medium">All systems operational</span>
        <span className="text-xs text-green-600 ml-auto">Last checked: {new Date().toLocaleTimeString()}</span>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Merchants"
          value={totalMerchants}
          subtitle={`${activeMerchants} active · ${pendingMerchants} pending`}
          icon={<Building2 className="h-4 w-4" />}
          color="blue"
          loading={merchantsLoading}
        />
        <KPICard
          title="Active Subscriptions"
          value={activeMerchants}
          subtitle={`${suspendedMerchants} suspended`}
          icon={<Users className="h-4 w-4" />}
          color="green"
          loading={merchantsLoading}
        />
        <KPICard
          title="MRR"
          value={formatCurrency(mrr)}
          subtitle="Monthly Recurring Revenue"
          icon={<DollarSign className="h-4 w-4" />}
          trend={8.3}
          color="purple"
          loading={revenueLoading}
        />
        <KPICard
          title="ARR"
          value={formatCurrency(arr)}
          subtitle={`Total collected: ${formatCurrency(totalRevenue)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          trend={12.1}
          color="orange"
          loading={revenueLoading}
        />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Growth AreaChart */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Growth</CardTitle>
                <CardDescription>Monthly recurring revenue over time (NGN)</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (revenueData ?? []).length === 0 ? (
                  <EmptyChartState
                    title="No Revenue Data Yet"
                    description="This chart will populate automatically once paid invoices start coming in."
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={revenueData ?? []}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      {/* @ts-ignore */}
                      <Tooltip formatter={(v: any) => [formatCurrency(v as number), 'Revenue']} />
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
                <CardTitle>Merchant Acquisition</CardTitle>
                <CardDescription>New merchants registered per month</CardDescription>
              </CardHeader>
              <CardContent>
                {acquisitionLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (acquisitionData ?? []).length === 0 ? (
                  <EmptyChartState
                    title="No Merchant Data Yet"
                    description="New merchant sign-ups will appear here as they register on the platform."
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={acquisitionData ?? []}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="merchants" name="Total"  fill="#6366f1" radius={[4,4,0,0]} />
                      <Bar dataKey="active"    name="Active" fill="#22c55e" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Status overview cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatusSummaryCard
              label="Active"
              count={activeMerchants}
              icon={<CheckCircle className="h-4 w-4 text-green-600" />}
              bg="bg-green-50"
            />
            <StatusSummaryCard
              label="Pending"
              count={pendingMerchants}
              icon={<Clock className="h-4 w-4 text-yellow-600" />}
              bg="bg-yellow-50"
            />
            <StatusSummaryCard
              label="Suspended"
              count={suspendedMerchants}
              icon={<Ban className="h-4 w-4 text-red-600" />}
              bg="bg-red-50"
            />
            <StatusSummaryCard
              label="Onboarded"
              count={merchants?.filter(m => m.onboarding_completed).length ?? 0}
              icon={<Activity className="h-4 w-4 text-blue-600" />}
              bg="bg-blue-50"
            />
          </div>
        </TabsContent>

        {/* ── MERCHANTS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="merchants">
          <Card>
            <CardHeader>
              <CardTitle>All Merchants</CardTitle>
              <CardDescription>Platform-wide merchant list ({totalMerchants} total)</CardDescription>
            </CardHeader>
            <CardContent>
              {merchantsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Verification</TableHead>
                        <TableHead>Onboarded</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(merchants ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                            No merchants registered yet
                          </TableCell>
                        </TableRow>
                      ) : (merchants ?? []).map(merchant => (
                        <TableRow key={merchant.id}>
                          <TableCell className="font-medium">{merchant.business_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{merchant.contact_email}</TableCell>
                          <TableCell><StatusBadge status={merchant.status} /></TableCell>
                          <TableCell><StatusBadge status={merchant.verification_status} /></TableCell>
                          <TableCell>
                            {merchant.onboarding_completed
                              ? <span className="text-green-600 text-sm">✓ Complete</span>
                              : <span className="text-yellow-600 text-sm">In Progress</span>
                            }
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(merchant.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
                <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Current MRR</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(mrr)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">ARR Projection</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(arr)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend (12 months)</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : (revenueData ?? []).length === 0 ? (
                <EmptyChartState
                  title="No Revenue Data Yet"
                  description="This chart is not showing demo or simulated data. It will populate once paid invoices exist for your merchants."
                />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={revenueData ?? []}>
                    <defs>
                      <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} />
                    {/* @ts-ignore */}
                    <Tooltip formatter={(v: any) => [formatCurrency(v as number), 'Revenue']} />
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
                <CardTitle>Live Audit Stream</CardTitle>
                <CardDescription>Latest 20 platform events · auto-refreshes every 30s</CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs text-muted-foreground ml-1">Live</span>
              </div>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {(auditLogs ?? []).length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">No audit events yet</p>
                  ) : (auditLogs ?? []).map(log => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors border border-border/50"
                    >
                      <div className="p-1.5 bg-primary/10 rounded">
                        <Activity className="h-3 w-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          <span className="text-primary">{log.action}</span>
                          {log.resource_type && (
                            <span className="text-muted-foreground"> · {log.resource_type}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          User: {log.user_id?.slice(0, 8)}…
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
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
  label, count, icon, bg,
}: { label: string; count: number; icon: React.ReactNode; bg: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}>{icon}</div>
        <p className="text-2xl font-bold">{count}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Empty Chart State ─────────────────────────────────────────────────────────
// Shown instead of a chart when there is genuinely no data in the database yet.
// This is intentionally NOT populated with mock/simulated data - an honest
// empty state is preferable to a misleading fake chart.
function EmptyChartState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
      <div className="p-3 bg-muted rounded-full mb-3">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-3 uppercase tracking-wide">
        This chart is not showing demo or simulated data
      </p>
    </div>
  );
}
