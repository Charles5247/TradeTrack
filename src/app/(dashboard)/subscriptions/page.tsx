"use client";

import { BankAccountPanel, UsagePanel } from "@/components/subscriptions/account-panels";
import { requireOrganization } from "@/lib/auth/organization";
import { withTimeout, AUTH_CHECK_TIMEOUT_MS } from "@/lib/utils/timeout";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  AlertTriangle,
  RefreshCw,
  Download,
  Calendar,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { useAuthStore } from "@/store";
import { useI18n } from "@/i18n";
import {
  PlanCard,
  FALLBACK_PLANS,
  FEATURE_LABELS,
  type Plan,
} from "@/components/subscriptions/plan-card";
import {
  isPendingFeature,
  filterDisplayFeatures,
} from "@/lib/subscriptions/plan-limits";
import {
  getActiveSubscriptionPlans,
  getAllSubscriptionPlansForCatalogManagement,
} from "@/lib/subscriptions/get-plans";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────
interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: "active" | "expired" | "cancelled" | "trial";
  starts_at: string;
  expires_at: string;
  created_at: string;
  billing_cycle?: string;
  plan?: Plan;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: "success" | "failed" | "pending";
  payment_method: string;
  provider_reference: string | null;
  created_at: string;
  plan_name?: string;
}

// ── Data fetchers ─────────────────────────────────────────────
// Plans query: the Plans tab has two different intents depending on
// caller role (see get-plans.ts's module doc for the full rationale):
//   - `business_owner` self-service plan selection must see ONLY the
//     live, sellable catalog — the exact same
//     `getActiveSubscriptionPlans()` the public /pricing page calls, so
//     the two surfaces can never render different plan sets again.
//   - `platform_owner` catalog management (add/edit/delete) must still
//     see EVERY row, including inactive/legacy ones, via the explicitly
//     named `getAllSubscriptionPlansForCatalogManagement()`.
async function fetchSubscriptionData() {
  const supabase = createClient();

  try {
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);
    if (!user) {
      return { subscription: null, plans: FALLBACK_PLANS, payments: [] };
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;
    const orgId = profile?.organization_id;
    const role = (profile as { role?: string } | null)?.role;
    if (!orgId?.trim()) {
      if (role === "platform_owner") return { subscription: null, plans: await getAllSubscriptionPlansForCatalogManagement(supabase), payments: [] };
      throw new Error("Your account is not linked to a business. Please contact your business owner.");
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    const plans =
      role === "platform_owner"
        ? await getAllSubscriptionPlansForCatalogManagement(supabase)
        : await getActiveSubscriptionPlans(supabase);

    const { data: payments, error: paymentsError } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (paymentsError) throw paymentsError;
    return {
      subscription: subscription as any as Subscription | null,
      plans: plans || FALLBACK_PLANS,
      payments: (payments as any as PaymentRecord[]) || [],
      orgId: orgId,
    };
  } catch (error) {
    throw error;
  }
}

// ── Sub-components ────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { variant: Parameters<typeof Badge>[0]["variant"]; label: string }
  > = {
    active: { variant: "success", label: "Active" },
    trial: { variant: "info", label: "Trial" },
    expired: { variant: "destructive", label: "Expired" },
    cancelled: { variant: "warning", label: "Cancelled" },
    success: { variant: "success", label: "Success" },
    failed: { variant: "destructive", label: "Failed" },
    pending: { variant: "warning", label: "Pending" },
  };
  const cfg = config[status] || { variant: "outline", label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ── Plan Create/Edit Form Data ─────────────────────────────────
interface PlanFormData {
  name: string;
  price: string;
  billing_cycle: string;
  max_cashiers: string;
  max_products: string;
  max_warehouses: string;
  features: string;
  is_active: boolean;
  is_popular: boolean;
}

const EMPTY_PLAN_FORM: PlanFormData = {
  name: "",
  price: "",
  billing_cycle: "monthly",
  max_cashiers: "1",
  max_products: "",
  max_warehouses: "",
  features: "",
  is_active: true,
  is_popular: false,
};

function planToFormData(plan: Plan): PlanFormData {
  return {
    name: plan.name,
    price: String(plan.price),
    billing_cycle: plan.billing_cycle || "monthly",
    max_cashiers: String(plan.max_cashiers),
    max_products: plan.max_products != null ? String(plan.max_products) : "",
    max_warehouses:
      plan.max_warehouses != null ? String(plan.max_warehouses) : "",
    features: (plan.features || []).join("\n"),
    is_active: plan.is_active,
    is_popular: !!plan.is_popular,
  };
}

// ── Plan Create/Edit Dialog ─────────────────────────────────────
function PlanFormDialog({
  open,
  editingPlan,
  onClose,
  onSaved,
}: {
  open: boolean;
  editingPlan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<PlanFormData>(EMPTY_PLAN_FORM);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(editingPlan ? planToFormData(editingPlan) : EMPTY_PLAN_FORM);
    }
  }, [open, editingPlan]);

  const update = (field: keyof PlanFormData, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function handleSave() {
    if (!form.name.trim() || !form.price) {
      toast.error(t.subscriptions.plan_name_price_required);
      return;
    }
    const priceNum = Number(form.price);
    const maxCashiersNum = Number(form.max_cashiers);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error(t.subscriptions.plan_price_invalid);
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        name: form.name.trim(),
        price: priceNum,
        billing_cycle: form.billing_cycle || "monthly",
        max_cashiers: Number.isFinite(maxCashiersNum) ? maxCashiersNum : 1,
        max_products: form.max_products.trim()
          ? Number(form.max_products)
          : null,
        max_warehouses: form.max_warehouses.trim()
          ? Number(form.max_warehouses)
          : null,
        features: form.features
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        is_active: form.is_active,
        is_popular: form.is_popular,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from("subscription_plans")
          .update(payload)
          .eq("id", editingPlan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subscription_plans")
          .insert(payload);
        if (error) throw error;
      }

      toast.success(
        editingPlan
          ? t.subscriptions.plan_updated
          : t.subscriptions.plan_created,
      );
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t.subscriptions.plan_save_failed,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {editingPlan
              ? t.subscriptions.edit_plan
              : t.subscriptions.create_plan}
          </DialogTitle>
          <DialogDescription>
            {t.subscriptions.plan_form_desc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t.subscriptions.plan_name} *</Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder={t.subscriptions.plan_name_placeholder}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.subscriptions.plan_price} (₦) *</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                placeholder="5000"
              />
            </div>
            <div>
              <Label>{t.subscriptions.billing_cycle}</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={form.billing_cycle}
                onChange={(e) => update("billing_cycle", e.target.value)}
              >
                <option value="monthly">{t.subscriptions.monthly}</option>
                <option value="yearly">{t.subscriptions.yearly}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>{t.subscriptions.max_cashiers_label}</Label>
              <Input
                type="number"
                value={form.max_cashiers}
                onChange={(e) => update("max_cashiers", e.target.value)}
                placeholder="e.g. 3, -1 for unlimited"
              />
            </div>
            <div>
              <Label>{t.subscriptions.max_products_label}</Label>
              <Input
                type="number"
                value={form.max_products}
                onChange={(e) => update("max_products", e.target.value)}
                placeholder={t.subscriptions.unlimited}
              />
            </div>
            <div>
              <Label>{t.subscriptions.max_warehouses_label}</Label>
              <Input
                type="number"
                value={form.max_warehouses}
                onChange={(e) => update("max_warehouses", e.target.value)}
                placeholder={t.subscriptions.unlimited}
              />
            </div>
          </div>

          <div>
            <Label>{t.subscriptions.features_label}</Label>
            <Textarea
              value={form.features}
              onChange={(e) => update("features", e.target.value)}
              placeholder={t.subscriptions.features_placeholder}
              rows={4}
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(v) => update("is_active", v === true)}
              />
              {t.subscriptions.plan_is_active}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={form.is_popular}
                onCheckedChange={(v) => update("is_popular", v === true)}
              />
              {t.subscriptions.plan_is_popular}
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t.subscriptions.cancel_action}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                {t.subscriptions.saving}
              </>
            ) : editingPlan ? (
              t.subscriptions.save_changes
            ) : (
              t.subscriptions.create_plan
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"plans" | "billing" | "methods" | "usage">(
    "plans",
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["subscriptions", user?.id, user?.organization_id],
    enabled: user?.role === "business_owner" || user?.role === "platform_owner",
    queryFn: fetchSubscriptionData,
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("subscription_plans")
        .delete()
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success(t.subscriptions.plan_deleted);
      setDeletingPlan(null);
    },
    onError: (e) => {
      toast.error(
        e instanceof Error ? e.message : t.subscriptions.plan_delete_failed,
      );
      setDeletingPlan(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!data?.subscription?.id || !user?.organization_id) throw new Error('No subscription to cancel.');
      const { error } = await createClient().from('subscriptions').update({ status: 'cancelled' }).eq('id', data.subscription.id).eq('organization_id', user.organization_id).select('id').single();
      if (error) throw error;
    },
    onSuccess: () => { setCancelOpen(false); queryClient.invalidateQueries({ queryKey: ['subscriptions'] }); toast.success('Subscription cancelled'); },
    onError: (e) => toast.error(e.message),
  });

  const upgradeMutation = useMutation({
    mutationFn: async ({
      planId,
      cycle,
    }: {
      planId: string;
      cycle: "monthly" | "yearly";
    }) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error(
          "Subscription payment is unavailable while offline. Please reconnect to the internet and try again.",
        );
      }

      const supabase = createClient();
      // In production this would integrate with Zainpay.
      // Self-service plan selection for the caller's own org (business_owner);
      // platform_owner catalog management is a separate, gated code path above.
      const {
        data: { user: authUser },
      } = await withTimeout(supabase.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);
      if (!authUser) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", authUser.id)
        .single();

      const organizationId = requireOrganization(profile);

      const expiresAt = new Date();
      if (cycle === "yearly") {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      // Upsert subscription
      const { error } = await supabase.from("subscriptions").upsert({
        organization_id: organizationId,
        plan_id: planId,
        status: "active",
        starts_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        created_by: authUser.id,
        billing_cycle: cycle,
      } as never);
      if (error) throw error;

      // Audit log
      await supabase
        .from("audit_logs")
        .insert({
          organization_id: organizationId,
          user_id: authUser.id,
          action: "SUBSCRIPTION_CHANGE",
          resource_type: "subscription",
          resource_id: planId,
          new_values: {
            plan_id: planId,
            status: "active",
            billing_cycle: cycle,
          },
        })
        .then(() => {}); // Non-blocking, ignore RLS errors
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success(t.subscriptions.updated_success);
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : t.subscriptions.update_failed,
      ),
  });

  // platform_owner (TracKasuwa) manages the global plan catalog (add/edit
  // price/delete packages). A merchant's business_owner can VIEW plans and
  // self-service select/upgrade their own org's plan, but cannot edit the
  // catalog itself (see migration 008's plans_manage_platform_owner policy).
  const isPlatformOwner = user?.role === "platform_owner";
  const canManagePlans = isPlatformOwner;
  const canAccessPage = user?.role === "business_owner" || isPlatformOwner;
  if (!canAccessPage) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Shield className="h-12 w-12 tt-muted" />
        <div className="text-center">
          <p className="font-medium">{t.subscriptions.access_restricted}</p>
          <p className="text-sm tt-muted">
            {t.subscriptions.super_admin_only}
          </p>
        </div>
      </div>
    );
  }

  const subscription = data?.subscription;
  const plans = data?.plans || FALLBACK_PLANS;
  const payments = data?.payments || [];
  const daysRemaining = subscription?.expires_at
    ? Math.ceil(
        (new Date(subscription.expires_at).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="tt-page-title">
            {isPlatformOwner ? "Subscription plans" : t.subscriptions.title}
          </h1>
          <p className="tt-muted text-sm">
            {isPlatformOwner ? "Manage platform pricing, features, and merchant usage limits." : t.subscriptions.subtitle}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
          }
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {t.subscriptions.refresh}
        </Button>
      </div>

      {!isPlatformOwner && <>
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <Card className="relative overflow-hidden border-transparent bg-primary p-6 text-primary-foreground sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[var(--c-accent)] opacity-20 blur-3xl" />
            {isLoading ? <Skeleton className="h-64" /> : <div className="relative space-y-6">
              <div><span className="rounded-full bg-primary-foreground/10 px-3 py-1 text-xs">Current plan</span><h2 className="mt-4 font-[family-name:var(--font-head)] text-4xl font-bold tracking-tight sm:text-5xl">{subscription?.plan?.name || 'Choose your plan'}</h2><p className="mt-2 text-sm opacity-80">{subscription ? 'Status: ' + subscription.status : 'Find the right fit for your business.'}</p></div>
              <dl className="flex flex-wrap items-end gap-x-8 gap-y-4"><div><dt className="sr-only">Plan price</dt><dd className="text-3xl font-bold">{formatCurrency(subscription?.plan?.price || 0, 'NGN')}</dd><p className="text-xs opacity-75">per {subscription?.plan?.billing_cycle === 'yearly' ? 'year' : 'month'}</p></div><div><dt className="text-xs opacity-75">Valid until</dt><dd className="mt-1 font-semibold">{subscription?.expires_at ? formatDate(subscription.expires_at) : 'No active period'}</dd></div><div><dt className="text-xs opacity-75">Renewal</dt><dd className="mt-1 font-semibold">Manual payment</dd></div></dl>
              <div className="flex flex-wrap gap-3"><Button className="bg-primary-foreground text-primary hover:bg-primary-foreground/90" onClick={() => { setActiveTab('plans'); }}>Change plan</Button>{subscription && ['active','trial'].includes(subscription.status) && <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setCancelOpen(true)}>Cancel subscription</Button>}</div>
            </div>}
          </Card>
          <BankAccountPanel organizationId={user?.organization_id} />
        </div>
        {daysRemaining !== null && daysRemaining <= 14 && subscription?.status !== 'cancelled' && <p role="status" className="rounded-lg border border-[var(--c-warn)]/30 bg-[var(--c-warn)]/10 p-4 text-sm">{daysRemaining > 0 ? 'Your subscription expires in ' + daysRemaining + ' days.' : 'Your subscription has expired.'} Choose a plan to renew.</p>}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
          <TabsList aria-label="Subscription sections"><TabsTrigger value="plans">{t.subscriptions.tab_plans}</TabsTrigger><TabsTrigger value="billing">{t.subscriptions.tab_billing}</TabsTrigger><TabsTrigger value="methods">Payment methods</TabsTrigger><TabsTrigger value="usage">Usage</TabsTrigger></TabsList>
        </Tabs>
        {activeTab === 'methods' && <div className="max-w-2xl"><BankAccountPanel organizationId={user?.organization_id} /></div>}
        {activeTab === 'usage' && <UsagePanel organizationId={user?.organization_id} plan={subscription?.plan} />}
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogContent><DialogHeader><DialogTitle>Cancel subscription?</DialogTitle><DialogDescription>This ends subscription access immediately. Existing sales and records are retained. This does not issue a refund.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep subscription</Button><Button variant="destructive" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>{cancelMutation.isPending ? 'Cancelling?' : 'Confirm cancellation'}</Button></DialogFooter></DialogContent></Dialog>
      </>}

      {/* Plans Tab */}
      {(isPlatformOwner || activeTab === "plans") && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {isPlatformOwner ? "Plan catalog" : t.subscriptions.choose_a_plan}
              </h2>
              <p className="text-sm tt-muted">
                {isPlatformOwner ? "Active plans appear on merchant subscription and public pricing pages." : t.subscriptions.select_plan_desc}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                value={billingCycle}
                onChange={setBillingCycle}
                options={[
                  { value: "monthly", label: t.subscriptions.monthly },
                  { value: "yearly", label: t.subscriptions.yearly },
                ]}
              />
              {canManagePlans && (
                <Button
                  onClick={() => {
                    setEditingPlan(null);
                    setPlanDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t.subscriptions.add_plan}
                </Button>
              )}
            </div>
          </div>
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-96" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 mt-8">
              {plans.map((plan) => (
                <div key={plan.id} className="space-y-2">
                  <PlanCard
                    compact
                    catalogOnly={isPlatformOwner}
                    plan={plan}
                    allPlans={plans}
                    currentPlanId={isPlatformOwner || !subscription || !["active", "trial"].includes(subscription.status) ? undefined : subscription.plan_id}
                    billingCycle={billingCycle}
                    onSelect={(planId) =>
                      upgradeMutation.mutate({ planId, cycle: billingCycle })
                    }
                    isLoading={upgradeMutation.isPending}
                  />
                  {canManagePlans && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setEditingPlan(plan);
                          setPlanDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        {t.subscriptions.edit_plan}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => setDeletingPlan(plan)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        {t.subscriptions.delete_plan}
                      </Button>
                    </div>
                  )}
                  {!plan.is_active && (
                    <Badge variant="outline" className="w-full justify-center">
                      {t.subscriptions.inactive_plan}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-center tt-muted">
            {t.subscriptions.all_plans_notice}
          </p>
        </div>
      )}

      {/* Billing Tab */}
      {!isPlatformOwner && activeTab === "billing" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {t.subscriptions.payment_history}
              </h2>
              <p className="text-sm tt-muted">
                {t.subscriptions.all_transactions}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={!payments.length} onClick={() => {
              const cell = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""').replace(/^[=+@-]/, match => "'" + match) + '"';
              const csv = [['Date','Reference','Amount','Currency','Method','Status'], ...payments.map(p => [p.created_at,p.provider_reference,p.amount,p.currency,p.payment_method,p.status])].map(row => row.map(cell).join(',')).join('\r\n');
              const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); const link = document.createElement('a'); link.href=url; link.download='billing-history.csv'; link.click(); URL.revokeObjectURL(url);
            }}>
              <Download className="h-4 w-4 mr-2" />
              {t.subscriptions.export}
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : payments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <CreditCard className="h-10 w-10 tt-muted" />
                <p className="font-medium">
                  {t.subscriptions.no_payment_records}
                </p>
                <p className="text-sm tt-muted">
                  {t.subscriptions.no_payment_records_desc}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="min-w-0 overflow-hidden p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.subscriptions.date}</TableHead>
                      <TableHead>{t.subscriptions.plan}</TableHead>
                      <TableHead>{t.subscriptions.reference}</TableHead>
                      <TableHead>{t.subscriptions.amount}</TableHead>
                      <TableHead>{t.subscriptions.method}</TableHead>
                      <TableHead>{t.subscriptions.status}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="text-sm">
                          {formatDate(payment.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {payment.plan_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono tt-muted">
                          {payment.provider_reference}
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
              <p className="font-medium text-destructive">
                {t.subscriptions.could_not_load}
              </p>
              <p className="text-sm tt-muted">
                {error instanceof Error ? error.message : t.subscriptions.fallback_notice}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan create/edit dialog */}
      <PlanFormDialog
        open={planDialogOpen}
        editingPlan={editingPlan}
        onClose={() => {
          setPlanDialogOpen(false);
          setEditingPlan(null);
        }}
        onSaved={() =>
          queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
        }
      />

      {/* Delete plan confirmation dialog */}
      <Dialog
        open={!!deletingPlan}
        onOpenChange={(v) => !v && setDeletingPlan(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t.subscriptions.delete_plan_title}</DialogTitle>
            <DialogDescription>
              {t.subscriptions.delete_plan_confirm.replace(
                "{name}",
                deletingPlan?.name ?? "",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeletingPlan(null)}
              disabled={deletePlanMutation.isPending}
            >
              {t.subscriptions.cancel_action}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deletingPlan && deletePlanMutation.mutate(deletingPlan.id)
              }
              disabled={deletePlanMutation.isPending}
            >
              {deletePlanMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                  {t.subscriptions.deleting}
                </>
              ) : (
                t.subscriptions.delete_plan
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
