'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  TrendingUp,
  Package,
  AlertTriangle,
  XCircle,
  Users,
  ArrowLeftRight,
  Clock,
  DollarSign,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime, formatRelativeTime } from '@/lib/utils/format';
import { useAuthStore } from '@/store';
import type { Sale, Product, VendorTransaction, WarehouseTransfer } from '@/types';

async function fetchDashboardData() {
  const supabase = createClient();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const [
    todaySales,
    weeklySales,
    monthlySales,
    products,
    lowStock,
    outOfStock,
    pendingVendors,
    pendingTransfers,
    recentSales,
    revenueData,
  ] = await Promise.all([
    supabase.from('sales').select('total').gte('created_at', todayStart).eq('status', 'completed'),
    supabase.from('sales').select('total').gte('created_at', weekStart).eq('status', 'completed'),
    supabase.from('sales').select('total').gte('created_at', monthStart).eq('status', 'completed'),
    supabase.from('products').select('id').eq('status', 'active'),
    supabase.from('inventory').select('id').lt('quantity', supabase.rpc as never).filter('quantity', 'lt', 5).filter('quantity', 'gt', 0),
    supabase.from('inventory').select('id').eq('quantity', 0),
    supabase.from('vendor_transactions').select('id,total_value,amount_paid').eq('status', 'pending'),
    supabase.from('warehouse_transfers').select('id').eq('status', 'pending'),
    supabase
      .from('sales')
      .select('id,invoice_number,total,payment_method,status,created_at,cashier_id')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('sales')
      .select('created_at,total')
      .gte('created_at', weekStart)
      .eq('status', 'completed')
      .order('created_at', { ascending: true }),
  ]);

  const todayRevenue = (todaySales.data || []).reduce((s, r) => s + (r.total || 0), 0);
  const weeklyRevenue = (weeklySales.data || []).reduce((s, r) => s + (r.total || 0), 0);
  const monthlyRevenue = (monthlySales.data || []).reduce((s, r) => s + (r.total || 0), 0);
  const pendingDebt = (pendingVendors.data || []).reduce((s, r) => s + ((r.total_value || 0) - (r.amount_paid || 0)), 0);

  // Process revenue chart data by day
  const dayMap: Record<string, number> = {};
  (revenueData.data || []).forEach((sale) => {
    const day = new Date(sale.created_at).toLocaleDateString('en-NG', { weekday: 'short' });
    dayMap[day] = (dayMap[day] || 0) + sale.total;
  });

  const chartData = Object.entries(dayMap).map(([date, revenue]) => ({
    date,
    revenue,
  }));

  return {
    stats: {
      today_sales: todaySales.data?.length || 0,
      today_revenue: todayRevenue,
      weekly_revenue: weeklyRevenue,
      monthly_revenue: monthlyRevenue,
      total_products: products.data?.length || 0,
      low_stock_count: lowStock.data?.length || 0,
      out_of_stock_count: outOfStock.data?.length || 0,
      pending_vendor_debts: pendingDebt,
      pending_transfers: pendingTransfers.data?.length || 0,
    },
    recentSales: recentSales.data || [],
    chartData,
  };
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardData,
    refetchInterval: 60000, // Refresh every minute
  });

  const stats = data?.stats;
  const recentSales = data?.recentSales || [];
  const chartData = data?.chartData || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Good {getGreeting()}, {user?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here&apos;s what&apos;s happening with your business today
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Today's Sales"
          value={stats ? stats.today_sales : 0}
          subtitle={formatCurrency(stats?.today_revenue || 0)}
          icon={ShoppingCart}
          iconColor="text-blue-600"
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          loading={isLoading}
        />
        <StatsCard
          title="Weekly Revenue"
          value={formatCurrency(stats?.weekly_revenue || 0)}
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBg="bg-green-100 dark:bg-green-900/30"
          loading={isLoading}
        />
        <StatsCard
          title="Monthly Revenue"
          value={formatCurrency(stats?.monthly_revenue || 0)}
          icon={DollarSign}
          iconColor="text-purple-600"
          iconBg="bg-purple-100 dark:bg-purple-900/30"
          loading={isLoading}
        />
        <StatsCard
          title="Total Products"
          value={stats?.total_products || 0}
          icon={Package}
          iconColor="text-indigo-600"
          iconBg="bg-indigo-100 dark:bg-indigo-900/30"
          loading={isLoading}
        />
      </div>

      {/* Alert Row */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Low Stock Items"
          value={stats?.low_stock_count || 0}
          subtitle="Need restocking soon"
          icon={AlertTriangle}
          iconColor="text-amber-600"
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          variant={stats?.low_stock_count ? 'warning' : 'default'}
          loading={isLoading}
        />
        <StatsCard
          title="Out of Stock"
          value={stats?.out_of_stock_count || 0}
          subtitle="Requires immediate attention"
          icon={XCircle}
          iconColor="text-red-600"
          iconBg="bg-red-100 dark:bg-red-900/30"
          variant={stats?.out_of_stock_count ? 'danger' : 'default'}
          loading={isLoading}
        />
        <StatsCard
          title="Pending Vendor Debts"
          value={formatCurrency(stats?.pending_vendor_debts || 0)}
          subtitle="Awaiting payment"
          icon={Users}
          iconColor="text-orange-600"
          iconBg="bg-orange-100 dark:bg-orange-900/30"
          variant={stats?.pending_vendor_debts ? 'warning' : 'default'}
          loading={isLoading}
        />
        <StatsCard
          title="Pending Transfers"
          value={stats?.pending_transfers || 0}
          subtitle="Warehouse transfers"
          icon={ArrowLeftRight}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-100 dark:bg-cyan-900/30"
          loading={isLoading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Last 7 days revenue trend</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#revenueGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <CardDescription>Latest sales activity</CardDescription>
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
              <div className="p-6 text-center">
                <ShoppingCart className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No sales yet today</p>
              </div>
            ) : (
              <div className="divide-y">
                {recentSales.slice(0, 6).map((sale: Partial<Sale>) => (
                  <div key={sale.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <ShoppingCart className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{sale.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.created_at ? formatRelativeTime(sale.created_at) : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatCurrency(sale.total || 0)}</p>
                      <Badge
                        variant={sale.status === 'completed' ? 'success' : 'pending'}
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
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks for today</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <a href="/pos" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-accent transition-colors text-center group">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium">New Sale</span>
            </a>
            <a href="/inventory" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-accent transition-colors text-center group">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Package className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-sm font-medium">Stock In</span>
            </a>
            <a href="/transfers" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-accent transition-colors text-center group">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                <ArrowLeftRight className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium">Transfer</span>
            </a>
            <a href="/reports" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-accent transition-colors text-center group">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium">Reports</span>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
