'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Shield,
  Star,
  AlertTriangle,
  RefreshCw,
  Download,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useAuthStore } from '@/store';

// ── Types ─────────────────────────────────────────────────────
interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billing_cycle: string;
  max_cashiers: number;
  max_products: number | null;
  max_warehouses: number | null;
  features: string[];
  is_active: boolean;
  is_popular?: boolean;
}

interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: 'active' | 'expired' | 'cancelled' | 'trial';
  starts_at: string;
  expires_at: string;
  created_at: string;
  plan?: Plan;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: 'success' | 'failed' | 'pending';
  payment_method: string;
  reference: string;
  created_at: string;
  plan_name?: string;
}

// ── Fallback plans if DB unavailable ────────────────────────
const FALLBACK_PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 3000,
    currency: 'NGN',
    billing_cycle: 'monthly',
    max_cashiers: 1,
    max_products: 500,
    max_warehouses: 1,
    features: [
      'Inventory Management',
      'Basic Sales',
      'Sales Reports',
      'Offline Mode',
      '1 Cashier',
    ],
    is_active: true,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 5000,
    currency: 'NGN',
    billing_cycle: 'monthly',
    max_cashiers: 3,
    max_products: 2000,
    max_warehouses: 2,
    features: [
      'Everything in Basic',
      'Receipt Printing',
      'Daily Summaries',
      'Vendor Consignment',
      'Warehouse Transfers',
      '3 Cashiers',
      'Priority Support',
    ],
    is_active: true,
    is_popular: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 8000,
    currency: 'NGN',
    billing_cycle: 'monthly',
    max_cashiers: -1,
    max_products: null,
    max_warehouses: null,
    features: [
      'Everything in Standard',
      'Unlimited Products',
      'Unlimited Warehouses',
      'Unlimited Cashiers',
      'Advanced Reports',
      'Audit Trail',
      'API Access',
      'Dedicated Support',
    ],
    is_active: true,
  },
];

// ── Data fetchers ─────────────────────────────────────────────
async function fetchSubscriptionData() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;

  // Fetch current subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*, plan:subscription_plans(*)')
    .eq('organization_id', orgId ?? '')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch all plans
  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  // Fetch payment history
  const { data: payments } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('organization_id', orgId ?? '')
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subscription: (subscription as any) as Subscription | null,
    plans: (plans as unknown as Plan[]) || FALLBACK_PLANS,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments: (payments as any) as PaymentRecord[] || [],
    orgId: orgId ?? '',
  };
}

// ── Sub-components ────────────────────────────────────────────
function PlanCard({
  plan,
  currentPlanId,
  onSelect,
  isLoading,
}: {
  plan: Plan;
  currentPlanId?: string;
  onSelect: (planId: string) => void;
  isLoading: boolean;
}) {
  const isCurrent = plan.id === currentPlanId;
  const Icon = plan.is_popular ? Star : plan.name === 'Business' ? Shield : Zap;

  return (
    <Card
      className={`relative transition-all ${
        plan.is_popular
          ? 'border-primary shadow-lg ring-1 ring-primary'
          : isCurrent
          ? 'border-green-500 ring-1 ring-green-500'
          : ''
      }`}
    >
      {plan.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3">Most Popular</Badge>
        </div>
      )}
      {isCurrent && !plan.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="success" className="px-3">Current Plan</Badge>
        </div>
      )}

      <CardHeader className="pb-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              plan.is_popular
                ? 'bg-primary/10'
                : isCurrent
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-muted'
            }`}
          >
            <Icon
              className={`h-4 w-4 ${
                plan.is_popular ? 'text-primary' : isCurrent ? 'text-green-600' : 'text-muted-foreground'
              }`}
            />
          </div>
          <CardTitle className="text-lg">{plan.name}</CardTitle>
        </div>
        <div className="mt-2">
          <span className="text-3xl font-bold">{formatCurrency(plan.price)}</span>
          <span className="text-muted-foreground text-sm">/{plan.billing_cycle}</span>
        </div>
        <CardDescription className="mt-1">
          {plan.max_cashiers === -1 ? 'Unlimited' : plan.max_cashiers} cashier
          {plan.max_cashiers !== 1 ? 's' : ''} ·{' '}
          {plan.max_products ? `${plan.max_products.toLocaleString()} products` : 'Unlimited products'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        <Button
          className="w-full mt-4"
          variant={isCurrent ? 'outline' : plan.is_popular ? 'default' : 'outline'}
          disabled={isCurrent || isLoading}
          onClick={() => onSelect(plan.id)}
        >
          {isCurrent ? 'Current Plan' : 'Select Plan'}
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: Parameters<typeof Badge>[0]['variant']; label: string }> = {
    active: { variant: 'success', label: 'Active' },
    trial: { variant: 'info', label: 'Trial' },
    expired: { variant: 'destructive', label: 'Expired' },
    cancelled: { variant: 'warning', label: 'Cancelled' },
    success: { variant: 'success', label: 'Success' },
    failed: { variant: 'destructive', label: 'Failed' },
    pending: { variant: 'warning', label: 'Pending' },
  };
  const cfg = config[status] || { variant: 'outline', label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ── Main Page ─────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'billing'>('overview');

  const { data, isLoading, error } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: fetchSubscriptionData,
  });

  const upgradeMutation = useMutation({
    mutationFn: async (planId: string) => {
      const supabase = createClient();
      // In production this would integrate with Zainpay.
      // For now we update directly (super_admin only).
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', authUser.id)
        .single();

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      // Upsert subscription
      const { error } = await supabase.from('subscriptions').upsert({
        organization_id: profile?.organization_id ?? '',
        plan_id: planId,
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        created_by: authUser.id,
      });
      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        organization_id: profile?.organization_id ?? '',
        user_id: authUser.id,
        action: 'SUBSCRIPTION_CHANGE',
        resource_type: 'subscription',
        resource_id: planId,
        new_values: { plan_id: planId, status: 'active' },
      }).then(() => {});  // Non-blocking, ignore RLS errors
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success('Subscription updated successfully');
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Failed to update subscription'),
  });

  // Only super_admin can manage subscriptions
  if (user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">Access Restricted</p>
          <p className="text-sm text-muted-foreground">Only Super Admins can manage subscriptions.</p>
        </div>
      </div>
    );
  }

  const subscription = data?.subscription;
  const plans = data?.plans || FALLBACK_PLANS;
  const payments = data?.payments || [];
  const daysRemaining = subscription?.expires_at
    ? Math.ceil(
        (new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscription Management</h1>
          <p className="text-muted-foreground text-sm">
            Manage your TradeTrack subscription and billing
          </p>
        </div>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['subscriptions'] })}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['overview', 'plans', 'billing'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}
            </div>
          ) : (
            <>
              {/* Subscription Status Cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Current Plan</CardDescription>
                    <CardTitle className="text-2xl">
                      {subscription?.plan?.name || 'No Plan'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {subscription ? (
                      <StatusBadge status={subscription.status} />
                    ) : (
                      <Badge variant="outline">Unsubscribed</Badge>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Subscription Expires</CardDescription>
                    <CardTitle className="text-lg">
                      {subscription?.expires_at
                        ? formatDate(subscription.expires_at)
                        : '—'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {daysRemaining !== null && (
                      <div
                        className={`flex items-center gap-1 text-sm ${
                          daysRemaining <= 7
                            ? 'text-red-600'
                            : daysRemaining <= 30
                            ? 'text-amber-600'
                            : 'text-green-600'
                        }`}
                      >
                        {daysRemaining <= 7 ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <Calendar className="h-4 w-4" />
                        )}
                        {daysRemaining > 0
                          ? `${daysRemaining} days remaining`
                          : 'Expired'}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Monthly Cost</CardDescription>
                    <CardTitle className="text-2xl">
                      {subscription?.plan?.price
                        ? formatCurrency(subscription.plan.price)
                        : '₦0'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Per month</p>
                  </CardContent>
                </Card>
              </div>

              {/* Expiry Warning */}
              {daysRemaining !== null && daysRemaining <= 14 && (
                <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/10">
                  <CardContent className="flex items-center gap-3 py-4">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-800 dark:text-amber-400">
                        Subscription Expiring Soon
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-500">
                        Your subscription expires in {daysRemaining} days. Renew now to avoid interruption.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setActiveTab('plans')}
                    >
                      Renew Now
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* No subscription */}
              {!subscription && (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                    <CreditCard className="h-12 w-12 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-lg">No Active Subscription</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Choose a plan to unlock all TradeTrack features
                      </p>
                    </div>
                    <Button onClick={() => setActiveTab('plans')}>
                      View Plans
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Plan Features */}
              {subscription?.plan && (
                <Card>
                  <CardHeader>
                    <CardTitle>Current Plan Features</CardTitle>
                    <CardDescription>{subscription.plan.name} plan inclusions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {subscription.plan.features?.map((feature: string) => (
                        <div key={feature} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          {feature}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t flex gap-3">
                      <Button variant="outline" onClick={() => setActiveTab('plans')}>
                        Upgrade Plan
                      </Button>
                      <Button variant="ghost" className="text-destructive hover:text-destructive">
                        Cancel Subscription
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Choose a Plan</h2>
            <p className="text-sm text-muted-foreground">
              Select the plan that best fits your business needs
            </p>
          </div>
          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-96" />)}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3 mt-8">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentPlanId={subscription?.plan_id}
                  onSelect={(planId) => upgradeMutation.mutate(planId)}
                  isLoading={upgradeMutation.isPending}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-center text-muted-foreground">
            All plans include offline-first functionality, multi-device support, and automatic data sync.
            Prices are billed monthly in Nigerian Naira (₦).
          </p>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Payment History</h2>
              <p className="text-sm text-muted-foreground">All payment transactions</p>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : payments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <CreditCard className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">No Payment Records</p>
                <p className="text-sm text-muted-foreground">
                  Payment history will appear here after your first transaction
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="text-sm">
                          {formatDate(payment.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {payment.plan_name || '—'}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {payment.reference}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          {payment.payment_method}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={payment.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-destructive">Could not load subscription data</p>
              <p className="text-sm text-muted-foreground">
                Showing fallback plan information. Connect to internet to see live data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
