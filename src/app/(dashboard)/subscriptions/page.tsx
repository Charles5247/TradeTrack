"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { useAuthStore } from "@/store";
import { useI18n } from "@/i18n";

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
  status: "active" | "expired" | "cancelled" | "trial";
  starts_at: string;
  expires_at: string;
  created_at: string;
  plan?: Plan;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: "success" | "failed" | "pending";
  payment_method: string;
  reference: string;
  created_at: string;
  plan_name?: string;
}

// ── Fallback plans if DB unavailable ────────────────────────
const FALLBACK_PLANS: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    price: 3000,
    currency: "NGN",
    billing_cycle: "monthly",
    max_cashiers: 1,
    max_products: 500,
    max_warehouses: 1,
    features: [
      "Inventory Management",
      "Basic Sales",
      "Sales Reports",
      "Offline Mode",
      "1 Cashier",
    ],
    is_active: true,
  },
  {
    id: "standard",
    name: "Standard",
    price: 5000,
    currency: "NGN",
    billing_cycle: "monthly",
    max_cashiers: 3,
    max_products: 2000,
    max_warehouses: 2,
    features: [
      "Everything in Basic",
      "Receipt Printing",
      "Daily Summaries",
      "Vendor Consignment",
      "Warehouse Transfers",
      "3 Cashiers",
      "Priority Support",
    ],
    is_active: true,
    is_popular: true,
  },
  {
    id: "business",
    name: "Business",
    price: 8000,
    currency: "NGN",
    billing_cycle: "monthly",
    max_cashiers: -1,
    max_products: null,
    max_warehouses: null,
    features: [
      "Everything in Standard",
      "Unlimited Products",
      "Unlimited Warehouses",
      "Unlimited Cashiers",
      "Advanced Reports",
      "Audit Trail",
      "API Access",
      "Dedicated Support",
    ],
    is_active: true,
  },
];

// ── Data fetchers ─────────────────────────────────────────────
async function fetchSubscriptionData() {
  const supabase = createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { subscription: null, plans: FALLBACK_PLANS, payments: [] };
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
    if (!orgId) {
      return { subscription: null, plans: FALLBACK_PLANS, payments: [] };
    }

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("organization_id", orgId ?? "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: plans } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("price", { ascending: true });

    const { data: payments } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("organization_id", orgId ?? "")
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      subscription: subscription as any as Subscription | null,
      plans: (plans as unknown as Plan[]) || FALLBACK_PLANS,
      payments: (payments as any as PaymentRecord[]) || [],
      orgId: orgId ?? "",
    };
  } catch {
    return { subscription: null, plans: FALLBACK_PLANS, payments: [] };
  }
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
  const { t } = useI18n();
  const isCurrent = plan.id === currentPlanId;
  const Icon = plan.is_popular ? Star : plan.name === "Business" ? Shield : Zap;

  return (
    <Card
      className={`relative transition-all ${
        plan.is_popular
          ? "border-primary shadow-lg ring-1 ring-primary"
          : isCurrent
            ? "border-green-500 ring-1 ring-green-500"
            : ""
      }`}
    >
      {plan.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3">
            {t.subscriptions.most_popular}
          </Badge>
        </div>
      )}
      {isCurrent && !plan.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="success" className="px-3">
            {t.subscriptions.current_plan_badge}
          </Badge>
        </div>
      )}

      <CardHeader className="pb-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              plan.is_popular
                ? "bg-primary/10"
                : isCurrent
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-muted"
            }`}
          >
            <Icon
              className={`h-4 w-4 ${
                plan.is_popular
                  ? "text-primary"
                  : isCurrent
                    ? "text-green-600"
                    : "text-muted-foreground"
              }`}
            />
          </div>
          <CardTitle className="text-lg">{plan.name}</CardTitle>
        </div>
        <div className="mt-2">
          <span className="text-3xl font-bold">
            {formatCurrency(plan.price)}
          </span>
          <span className="text-muted-foreground text-sm">
            /{plan.billing_cycle}
          </span>
        </div>
        <CardDescription className="mt-1">
          {plan.max_cashiers === -1
            ? t.subscriptions.unlimited
            : plan.max_cashiers}{" "}
          {t.subscriptions.cashiers_count} ·{" "}
          {plan.max_products
            ? t.subscriptions.products_count.replace(
                "{count}",
                plan.max_products.toLocaleString(),
              )
            : t.subscriptions.unlimited_products}
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
          variant={
            isCurrent ? "outline" : plan.is_popular ? "default" : "outline"
          }
          disabled={isCurrent || isLoading}
          onClick={() => onSelect(plan.id)}
        >
          {isCurrent
            ? t.subscriptions.current_plan_badge
            : t.subscriptions.select_plan}
        </Button>
      </CardContent>
    </Card>
  );
}

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
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
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
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => update("is_active", e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              {t.subscriptions.plan_is_active}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_popular}
                onChange={(e) => update("is_popular", e.target.checked)}
                className="h-4 w-4 rounded border-input"
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
  const [activeTab, setActiveTab] = useState<"overview" | "plans" | "billing">(
    "overview",
  );
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["subscriptions"],
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

  const upgradeMutation = useMutation({
    mutationFn: async (planId: string) => {
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
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", authUser.id)
        .single();

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      // Upsert subscription
      const { error } = await supabase.from("subscriptions").upsert({
        organization_id: profile?.organization_id ?? "",
        plan_id: planId,
        status: "active",
        starts_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        created_by: authUser.id,
      });
      if (error) throw error;

      // Audit log
      await supabase
        .from("audit_logs")
        .insert({
          organization_id: profile?.organization_id ?? "",
          user_id: authUser.id,
          action: "SUBSCRIPTION_CHANGE",
          resource_type: "subscription",
          resource_id: planId,
          new_values: { plan_id: planId, status: "active" },
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

  // platform_owner (TradeTrack) manages the global plan catalog (add/edit
  // price/delete packages). A merchant's business_owner can VIEW plans and
  // self-service select/upgrade their own org's plan, but cannot edit the
  // catalog itself (see migration 008's plans_manage_platform_owner policy).
  const isPlatformOwner = user?.role === "platform_owner";
  const canManagePlans = isPlatformOwner;
  const canAccessPage = user?.role === "business_owner" || isPlatformOwner;
  if (!canAccessPage) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">{t.subscriptions.access_restricted}</p>
          <p className="text-sm text-muted-foreground">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.subscriptions.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.subscriptions.subtitle}
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

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["overview", "plans", "billing"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          ) : (
            <>
              {/* Subscription Status Cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>
                      {t.subscriptions.current_plan}
                    </CardDescription>
                    <CardTitle className="text-2xl">
                      {subscription?.plan?.name || t.subscriptions.no_plan}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {subscription ? (
                      <StatusBadge status={subscription.status} />
                    ) : (
                      <Badge variant="outline">
                        {t.subscriptions.unsubscribed}
                      </Badge>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>
                      {t.subscriptions.subscription_expires}
                    </CardDescription>
                    <CardTitle className="text-lg">
                      {subscription?.expires_at
                        ? formatDate(subscription.expires_at)
                        : "—"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {daysRemaining !== null && (
                      <div
                        className={`flex items-center gap-1 text-sm ${
                          daysRemaining <= 7
                            ? "text-red-600"
                            : daysRemaining <= 30
                              ? "text-amber-600"
                              : "text-green-600"
                        }`}
                      >
                        {daysRemaining <= 7 ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <Calendar className="h-4 w-4" />
                        )}
                        {daysRemaining > 0
                          ? t.subscriptions.days_remaining.replace(
                              "{count}",
                              String(daysRemaining),
                            )
                          : t.subscriptions.expired}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>
                      {t.subscriptions.monthly_cost}
                    </CardDescription>
                    <CardTitle className="text-2xl">
                      {subscription?.plan?.price
                        ? formatCurrency(subscription.plan.price)
                        : "₦0"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {t.subscriptions.per_month}
                    </p>
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
                        {t.subscriptions.expiring_soon}
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-500">
                        {t.subscriptions.expiring_soon_desc.replace(
                          "{count}",
                          String(daysRemaining),
                        )}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setActiveTab("plans")}>
                      {t.subscriptions.renew_now}
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
                      <p className="font-medium text-lg">
                        {t.subscriptions.no_active_subscription}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t.subscriptions.choose_plan_unlock}
                      </p>
                    </div>
                    <Button onClick={() => setActiveTab("plans")}>
                      {t.subscriptions.view_plans}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Plan Features */}
              {subscription?.plan && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t.subscriptions.current_plan_features}
                    </CardTitle>
                    <CardDescription>
                      {t.subscriptions.plan_inclusions.replace(
                        "{name}",
                        subscription.plan.name,
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {subscription.plan.features?.map((feature: string) => (
                        <div
                          key={feature}
                          className="flex items-center gap-2 text-sm"
                        >
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          {feature}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setActiveTab("plans")}
                      >
                        {t.subscriptions.upgrade_plan}
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                      >
                        {t.subscriptions.cancel_subscription}
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
      {activeTab === "plans" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {t.subscriptions.choose_a_plan}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t.subscriptions.select_plan_desc}
              </p>
            </div>
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
          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-96" />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3 mt-8">
              {plans.map((plan) => (
                <div key={plan.id} className="space-y-2">
                  <PlanCard
                    plan={plan}
                    currentPlanId={subscription?.plan_id}
                    onSelect={(planId) => upgradeMutation.mutate(planId)}
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
          <p className="text-xs text-center text-muted-foreground">
            {t.subscriptions.all_plans_notice}
          </p>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === "billing" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {t.subscriptions.payment_history}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t.subscriptions.all_transactions}
              </p>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              {t.subscriptions.export}
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : payments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <CreditCard className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">
                  {t.subscriptions.no_payment_records}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.subscriptions.no_payment_records_desc}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
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
              <p className="font-medium text-destructive">
                {t.subscriptions.could_not_load}
              </p>
              <p className="text-sm text-muted-foreground">
                {t.subscriptions.fallback_notice}
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
        <DialogContent className="sm:max-w-[420px]">
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
