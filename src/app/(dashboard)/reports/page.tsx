'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, TrendingUp, Package, DollarSign, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

async function fetchReport(period: ReportPeriod) {
  const supabase = createClient();
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'daily': startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case 'weekly': startDate = new Date(now.getTime() - 7 * 86400000); break;
    case 'monthly': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'quarterly': startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
    case 'yearly': startDate = new Date(now.getFullYear(), 0, 1); break;
  }

  const [salesData, topProductsData, paymentMethods] = await Promise.all([
    supabase
      .from('sales')
      .select('id,total,subtotal,discount,tax,payment_method,status,created_at')
      .gte('created_at', startDate.toISOString())
      .eq('status', 'completed'),
    supabase
      .from('sale_items')
      .select('product_id,quantity,total,unit_price,cost_price,product:products(name,sku)')
      .gte('created_at', startDate.toISOString())
      .limit(200),
    supabase
      .from('sales')
      .select('payment_method, total')
      .gte('created_at', startDate.toISOString())
      .eq('status', 'completed'),
  ]);

  const sales = salesData.data || [];
  const items = topProductsData.data || [];
  const pmData = paymentMethods.data || [];

  const totalRevenue = sales.reduce((s, r) => s + r.total, 0);
  const totalCost = items.reduce((s, i) => s + (i.cost_price || 0) * i.quantity, 0);
  const grossProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Top products
  const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
  items.forEach((i) => {
    const pid = i.product_id;
    if (!productMap[pid]) {
      productMap[pid] = {
        name: (i.product as { name?: string } | null)?.name || 'Unknown',
        quantity: 0,
        revenue: 0,
      };
    }
    productMap[pid].quantity += i.quantity;
    productMap[pid].revenue += i.total;
  });
  const topProducts = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Payment method breakdown
  const pmMap: Record<string, number> = {};
  pmData.forEach((p) => {
    pmMap[p.payment_method] = (pmMap[p.payment_method] || 0) + p.total;
  });
  const pmChartData = Object.entries(pmMap).map(([method, total]) => ({ method, total }));

  // Daily revenue breakdown
  const dailyMap: Record<string, number> = {};
  sales.forEach((s) => {
    const day = new Date(s.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
    dailyMap[day] = (dailyMap[day] || 0) + s.total;
  });
  const dailyChart = Object.entries(dailyMap).map(([date, total]) => ({ date, total }));

  return {
    summary: {
      total_transactions: sales.length,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      gross_profit: grossProfit,
      profit_margin: profitMargin,
      avg_sale: sales.length > 0 ? totalRevenue / sales.length : 0,
    },
    topProducts,
    pmChartData,
    dailyChart,
  };
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444'];

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('monthly');

  const { data, isLoading } = useQuery({
    queryKey: ['reports', period],
    queryFn: () => fetchReport(period),
  });

  const exportCSV = () => {
    if (!data?.topProducts) return;
    const headers = ['Product', 'Units Sold', 'Revenue'];
    const rows = data.topProducts.map((p) => [p.name, p.quantity, p.revenue]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm">Business performance insights</p>
        </div>
        <div className="flex gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Today</SelectItem>
              <SelectItem value="weekly">This Week</SelectItem>
              <SelectItem value="monthly">This Month</SelectItem>
              <SelectItem value="quarterly">This Quarter</SelectItem>
              <SelectItem value="yearly">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Transactions', value: summary?.total_transactions || 0, icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Total Revenue', value: formatCurrency(summary?.total_revenue || 0), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100' },
          { label: 'Gross Profit', value: formatCurrency(summary?.gross_profit || 0), icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-100' },
          { label: 'Profit Margin', value: `${(summary?.profit_margin || 0).toFixed(1)}%`, icon: Package, color: 'text-amber-600', bg: 'bg-amber-100' },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${stat.bg} dark:opacity-80 shrink-0`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                {isLoading ? <Skeleton className="h-6 w-24 mt-1" /> : (
                  <p className="text-xl font-bold">{stat.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Day</CardTitle>
            <CardDescription>Daily revenue breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data?.dailyChart || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Revenue by payment method</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data?.pmChartData || []}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="total"
                    nameKey="method"
                    // @ts-ignore
                    label={(props) => `${props.method} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {(data?.pmChartData || []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle>Top Selling Products</CardTitle>
          <CardDescription>Products by revenue for selected period</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Units Sold</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))
              ) : (data?.topProducts || []).map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.quantity}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(p.revenue)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full"
                          style={{ width: `${((p.revenue / (summary?.total_revenue || 1)) * 100).toFixed(0)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">
                        {((p.revenue / (summary?.total_revenue || 1)) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
