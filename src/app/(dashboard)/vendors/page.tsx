"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { useAuthStore, useOrgStore } from "@/store";
import type { VendorTransaction, Product } from "@/types";
import { useI18n } from "@/i18n";
import {
  buildReceiptData,
  type ReceiptData,
} from "@/lib/receipt/build-receipt";
import { AccessGuard } from "@/components/shared/access-guard";
import { downloadReceiptPDF } from "@/lib/pdf/receipt-pdf";
import { generateId } from "@/lib/utils/id";
import { getAllFromOfflineDB, saveToOfflineDB } from "@/lib/offline/db";
import {
  getOfflineVendorTransactions,
  persistOfflineVendorTransaction,
  requireSyncedVendorTransaction,
} from "@/lib/offline/vendor-transactions";
import { syncEngine } from "@/lib/offline/sync-engine";
import { isOffline } from "@/lib/utils/network";
import { useOnlineStatus } from "@/hooks/use-online-status";

async function fetchVendors(organizationId: string) {
  if (!isOffline()) {
    try {
      await syncEngine?.pullVendorTransactions(organizationId);
    } catch {
      /* Fall back to cached transactions on network failure. */
    }
  }
  return getOfflineVendorTransactions(organizationId);
}

async function fetchVendorProducts(organizationId: string) {
  if (!isOffline()) {
    try {
      const { data, error } = await createClient()
        .from("products")
        .select("*")
        .eq("organization_id", organizationId);
      if (error) throw error;
      await saveToOfflineDB("products", data || []);
    } catch {
      /* Browser connectivity does not guarantee server reachability. */
    }
  }
  return (await getAllFromOfflineDB<Product>("products"))
    .filter(
      (product) =>
        product.organization_id === organizationId &&
        product.status === "active",
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function VendorsPage() {
  return (
    <AccessGuard allow={["business_owner", "admin"]}>
      <VendorsPageInner />
    </AccessGuard>
  );
}

function VendorsPageInner() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const orgId = user?.organization_id;
  const isOnline = useOnlineStatus();
  React.useEffect(
    () =>
      syncEngine?.subscribe((state) => {
        if (state.status === "idle" && state.lastSync)
          queryClient.invalidateQueries({ queryKey: ["vendors"] });
      }),
    [queryClient],
  );
  const { organizationName, organizationAddress, organizationPhone } =
    useOrgStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewVendor, setViewVendor] = useState<VendorTransaction | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    open: boolean;
    vendor: VendorTransaction | null;
  }>({ open: false, vendor: null });
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState<string>("");
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [formData, setFormData] = useState({
    vendor_name: "",
    vendor_phone: "",
    vendor_email: "",
    date_issued: new Date().toISOString().split("T")[0],
    expected_payment_date: "",
    notes: "",
    items: [{ product_id: "", quantity: "", unit_price: "" }],
  });

  const { data: products = [] } = useQuery({
    queryKey: ["vendor-products", orgId],
    queryFn: () => fetchVendorProducts(orgId!),
    networkMode: "always",
    enabled: !!orgId,
  });
  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors", orgId],
    queryFn: () => fetchVendors(orgId!),
    networkMode: "always",
    enabled: !!orgId,
  });
  const paymentReady = !!vendors.find(
    (vendor) => vendor.id === paymentDialog.vendor?.id,
  )?.paymentReady;

  const createMutation = useMutation({
    networkMode: "always",
    mutationFn: (data: typeof formData) =>
      persistOfflineVendorTransaction({
        ...data,
        organization_id: orgId!,
        created_by: user!.id,
        items: data.items.filter(
          (item) => item.product_id && item.quantity && item.unit_price,
        ),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setIsFormOpen(false);
      toast.success(t.vendors.new_transaction);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void syncEngine?.sync();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : t.vendors.no_transactions),
  });

  const markPaidMutation = useMutation({
    networkMode: "always",
    mutationFn: async ({
      id,
      amount,
      payment_method,
      receipt_url,
    }: {
      id: string;
      amount: number;
      payment_method?: string;
      receipt_url?: string;
    }) => {
      const supabase = createClient();
      await requireSyncedVendorTransaction(id, orgId!);
      const { data: vt, error: readError } = await supabase
        .from("vendor_transactions")
        .select("total_value")
        .eq("id", id)
        .single();
      if (readError) throw readError;
      const status = amount >= (vt?.total_value || 0) ? "completed" : "partial";
      const { error } = await supabase
        .from("vendor_transactions")
        .update({
          amount_paid: amount,
          status,
          ...(payment_method
            ? { payment_method: payment_method as "cash" | "transfer" | "pos" }
            : {}),
          ...(receipt_url ? { receipt_url } : {}),
        })
        .eq("id", id);
      if (error) throw error;

      const paymentStatus =
        amount >= (vt?.total_value || 0) ? "paid" : "partial";
      const saleStatus =
        amount >= (vt?.total_value || 0) ? "completed" : "pending";
      const { error: saleError } = await supabase
        .from("sales")
        .update({
          amount_paid: amount,
          change_amount: Math.max(0, amount - (vt?.total_value || 0)),
          payment_status: paymentStatus,
          status: saleStatus,
        })
        .eq("notes", `Vendor transaction ${id}`);
      if (saleError) throw saleError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success(t.vendors.mark_paid);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Unable to record payment",
      ),
  });

  const statusBadge = (status: string, expectedDate?: string) => {
    const isOverdue =
      expectedDate &&
      new Date(expectedDate) < new Date() &&
      status === "pending";
    if (isOverdue)
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          {t.vendors.overdue}
        </Badge>
      );
    const map: Record<string, Parameters<typeof Badge>[0]["variant"]> = {
      pending: "warning",
      completed: "success",
      cancelled: "destructive",
      partial: "info",
    };
    return <Badge variant={map[status] || "outline"}>{status}</Badge>;
  };

  const totalPending = vendors
    .filter((v) => v.status === "pending" || v.status === "partial")
    .reduce((s, v) => s + (v.total_value - v.amount_paid), 0);

  const getVendorReceiptData = (vendor: VendorTransaction): ReceiptData => {
    const items = (vendor.items || []).map((item) => ({
      name: (item.product as { name?: string } | null)?.name || "Item",
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.total,
    }));

    return buildReceiptData({
      sale: {
        invoice_number: `VENDOR-${vendor.id.slice(0, 8).toUpperCase()}`,
        subtotal: vendor.total_value,
        discount: 0,
        tax: 0,
        total: vendor.total_value,
        amount_paid: vendor.amount_paid,
        change_amount: Math.max(0, vendor.total_value - vendor.amount_paid),
        payment_method: "transfer",
        customer_name: vendor.vendor_name,
        customer_phone: vendor.vendor_phone,
        notes: vendor.notes,
        created_at: vendor.created_at,
        receipt_url: vendor.receipt_url ?? undefined,
      },
      items: items.map((item) => ({
        product: { name: item.name } as never,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        unitPrice: item.unitPrice,
        total: item.total,
        discount: 0,
      })) as never,
      orgName: organizationName,
      orgAddress: organizationAddress || undefined,
      orgPhone: organizationPhone || undefined,
      cashierName:
        (vendor.creator as { full_name?: string } | null)?.full_name ||
        user?.full_name,
      currency: "NGN",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.vendors.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.vendors.subtitle_debt.split(":")[0]}:{" "}
            <span className="font-semibold text-amber-600">
              {formatCurrency(totalPending)}
            </span>
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.vendors.new_transaction}
        </Button>
      </div>

      {/* Alert Banner */}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t.vendors.alert_banner.split("{amount}")[0]}
            <strong>{formatCurrency(totalPending)}</strong>
            {t.vendors.alert_banner.split("{amount}")[1]}
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.vendors.vendor_name}</TableHead>
                <TableHead>{t.vendors.phone}</TableHead>
                <TableHead>{t.vendors.date_issued}</TableHead>
                <TableHead>{t.vendors.expected_payment}</TableHead>
                <TableHead>{t.vendors.total_value}</TableHead>
                <TableHead>{t.vendors.amount_paid}</TableHead>
                <TableHead>{t.vendors.balance}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="text-right">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(9)].map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : vendors.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {t.vendors.no_transactions}
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((v) => {
                  const balance = v.total_value - v.amount_paid;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">
                        {v.vendor_name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {v.vendor_phone || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(v.date_issued)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {v.expected_payment_date ? (
                          <span
                            className={
                              new Date(v.expected_payment_date) < new Date() &&
                              v.status === "pending"
                                ? "text-red-600 font-medium"
                                : ""
                            }
                          >
                            {formatDate(v.expected_payment_date)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{formatCurrency(v.total_value)}</TableCell>
                      <TableCell className="text-green-600">
                        {formatCurrency(v.amount_paid)}
                      </TableCell>
                      <TableCell
                        className={
                          balance > 0
                            ? "text-amber-600 font-semibold"
                            : "text-green-600"
                        }
                      >
                        {formatCurrency(balance)}
                      </TableCell>
                      <TableCell>
                        {statusBadge(v.status, v.expected_payment_date)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(v.status === "pending" || v.status === "partial") &&
                          (!isOnline || !v.paymentReady) && (
                            <p
                              className="text-xs text-muted-foreground mb-1"
                              role="status"
                            >
                              {!isOnline
                                ? "Reconnect to record payment."
                                : "Waiting for this transaction, its items and linked sale to sync."}
                            </p>
                          )}
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setViewVendor(v)}
                          >
                            {t.vendors.view}
                          </Button>
                          {(v.status === "pending" ||
                            v.status === "partial") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-green-600 border-green-200"
                              disabled={
                                !isOnline ||
                                !v.paymentReady ||
                                markPaidMutation.isPending
                              }
                              onClick={() => {
                                setPaymentAmount(String(Math.max(0, balance)));
                                setPaymentDialog({ open: true, vendor: v });
                              }}
                            >
                              <DollarSign className="h-3 w-3 mr-1" />{" "}
                              {t.vendors.pay}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Form */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.vendors.new_transaction}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.vendors.vendor_name_required}</Label>
                <Input
                  value={formData.vendor_name}
                  onChange={(e) =>
                    setFormData({ ...formData, vendor_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t.vendors.phone}</Label>
                <Input
                  value={formData.vendor_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, vendor_phone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t.vendors.date_issued}</Label>
                <Input
                  type="date"
                  value={formData.date_issued}
                  onChange={(e) =>
                    setFormData({ ...formData, date_issued: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t.vendors.expected_payment}</Label>
                <Input
                  type="date"
                  value={formData.expected_payment_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      expected_payment_date: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            {/* Items */}
            <div>
              <Label className="mb-2 block">
                {t.vendors.products_required}
              </Label>
              {formData.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2 mb-2">
                  <Select
                    onValueChange={(v) => {
                      const p = products.find((pr) => pr.id === v);
                      const items = [...formData.items];
                      items[idx] = {
                        ...items[idx],
                        product_id: v,
                        unit_price: String(p?.selling_price || ""),
                      };
                      setFormData({ ...formData, items });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.vendors.product} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder={t.vendors.qty}
                    value={item.quantity}
                    onChange={(e) => {
                      const items = [...formData.items];
                      items[idx].quantity = e.target.value;
                      setFormData({ ...formData, items });
                    }}
                  />
                  <Input
                    type="number"
                    placeholder={t.vendors.unit_price}
                    value={item.unit_price}
                    onChange={(e) => {
                      const items = [...formData.items];
                      items[idx].unit_price = e.target.value;
                      setFormData({ ...formData, items });
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData({
                    ...formData,
                    items: [
                      ...formData.items,
                      { product_id: "", quantity: "", unit_price: "" },
                    ],
                  })
                }
              >
                <Plus className="h-3 w-3 mr-1" /> {t.vendors.add_item}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t.vendors.notes}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsFormOpen(false)}
              >
                {t.vendors.cancel}
              </Button>
              <Button
                className="flex-1"
                onClick={() => createMutation.mutate(formData)}
                disabled={createMutation.isPending}
              >
                {t.vendors.create_transaction}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentDialog.open}
        onOpenChange={(open) =>
          setPaymentDialog({ open, vendor: open ? paymentDialog.vendor : null })
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {(!isOnline || !paymentReady) && (
            <p role="status" className="text-sm text-muted-foreground">
              {!isOnline
                ? "Reconnect to record payment."
                : "Waiting for this transaction, its items and linked sale to sync."}
            </p>
          )}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{paymentDialog.vendor?.vendor_name}</p>
              <p className="text-muted-foreground">
                Balance:{" "}
                {formatCurrency(
                  (paymentDialog.vendor?.total_value || 0) -
                    (paymentDialog.vendor?.amount_paid || 0),
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Amount paid</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.vendors.payment_method}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder={t.vendors.select_payment_method} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t.pos.cash}</SelectItem>
                  <SelectItem value="transfer">{t.pos.transfer}</SelectItem>
                  <SelectItem value="pos">{t.pos.pos_terminal}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.vendors.proof_of_payment}</Label>
              {paymentReceiptUrl ? (
                <div className="flex items-center justify-between rounded-md border border-border p-2 text-xs">
                  <span className="text-green-600">
                    {t.vendors.receipt_uploaded}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPaymentReceiptUrl("")}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <label className="flex items-center gap-2 rounded-md border border-dashed border-border p-2 text-xs cursor-pointer hover:bg-muted/50">
                  {isUploadingReceipt ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span>{t.vendors.upload_receipt}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={!isOnline || !paymentReady || isUploadingReceipt}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setIsUploadingReceipt(true);
                      try {
                        const supabase = createClient();
                        const {
                          data: { user: authUser },
                        } = await supabase.auth.getUser();
                        if (!authUser) throw new Error("Not authenticated");
                        const path = `${authUser.id}/vendor-${generateId()}-${Date.now()}.${file.name.split(".").pop() || "jpg"}`;
                        const { error: uploadErr } = await supabase.storage
                          .from("receipts")
                          .upload(path, file, { upsert: true });
                        if (uploadErr) throw uploadErr;
                        const { data: signed } = await supabase.storage
                          .from("receipts")
                          .createSignedUrl(path, 60 * 60 * 24 * 365);
                        setPaymentReceiptUrl(signed?.signedUrl || path);
                        toast.success(t.vendors.receipt_uploaded);
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Upload failed",
                        );
                      } finally {
                        setIsUploadingReceipt(false);
                      }
                    }}
                  />
                </label>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPaymentDialog({ open: false, vendor: null })}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (!paymentDialog.vendor) return;
                  const amount = Number(paymentAmount);
                  if (!Number.isFinite(amount) || amount <= 0) {
                    toast.error("Enter a valid payment amount");
                    return;
                  }
                  markPaidMutation.mutate({
                    id: paymentDialog.vendor.id,
                    amount: paymentDialog.vendor.amount_paid + amount,
                    payment_method: paymentMethod,
                    receipt_url: paymentReceiptUrl || undefined,
                  });
                  setPaymentDialog({ open: false, vendor: null });
                  setPaymentAmount("");
                  setPaymentMethod("cash");
                  setPaymentReceiptUrl("");
                }}
                disabled={
                  !isOnline ||
                  !paymentReady ||
                  markPaidMutation.isPending ||
                  isUploadingReceipt
                }
              >
                Save payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewVendor && (
        <Dialog open={!!viewVendor} onOpenChange={() => setViewVendor(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {t.vendors.view_dialog_title.replace(
                  "{name}",
                  viewVendor.vendor_name,
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">
                    {t.common.status}:
                  </span>{" "}
                  {statusBadge(viewVendor.status)}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t.vendors.phone}:
                  </span>{" "}
                  {viewVendor.vendor_phone || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t.vendors.issued}:
                  </span>{" "}
                  {formatDate(viewVendor.date_issued)}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t.vendors.expected}:
                  </span>{" "}
                  {viewVendor.expected_payment_date
                    ? formatDate(viewVendor.expected_payment_date)
                    : "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t.vendors.total}:
                  </span>{" "}
                  <strong>{formatCurrency(viewVendor.total_value)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t.vendors.paid}:
                  </span>{" "}
                  <span className="text-green-600 font-medium">
                    {formatCurrency(viewVendor.amount_paid)}
                  </span>
                </div>
              </div>
              <div>
                <p className="font-medium mb-2">{t.vendors.products_label}</p>
                {(viewVendor.items || []).map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between py-1 border-b border-border/50"
                  >
                    <span>
                      {(item.product as { name?: string } | null)?.name}
                    </span>
                    <span>
                      {item.quantity} × {formatCurrency(item.unit_price)} ={" "}
                      <strong>{formatCurrency(item.total)}</strong>
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const receiptData = getVendorReceiptData(viewVendor);
                      if (viewVendor.status === "completed") {
                        downloadReceiptPDF(receiptData);
                      } else {
                        window.print();
                      }
                    }}
                  >
                    {viewVendor.status === "completed"
                      ? "Download receipt"
                      : "Generate invoice"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
