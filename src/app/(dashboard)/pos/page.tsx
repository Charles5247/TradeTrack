"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  X,
  CreditCard,
  Printer,
  Package,
  AlertCircle,
  Check,
  Barcode,
  Download,
  Usb,
  Bluetooth,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/format";
import { useCartStore, useAuthStore, useOrgStore } from "@/store";
import { useI18n } from "@/i18n";
import type { Product, Warehouse, CartItem } from "@/types";
import Image from "next/image";
import { usePrinter } from "@/hooks/use-printer";
import {
  buildReceiptData,
  type ReceiptData,
} from "@/lib/receipt/build-receipt";
import { AccessGuard } from "@/components/shared/access-guard";
import { downloadReceiptPDF } from "@/lib/pdf/receipt-pdf";
import { Receipt } from "@/components/pos/receipt";
import { getAllFromOfflineDB } from "@/lib/offline/db";
import { persistOfflineSale } from "@/lib/offline/sales";
import { generateId } from "@/lib/utils/id";
import { requireOnline } from "@/lib/utils/network";

async function searchProducts(query: string, warehouseId: string) {
  const supabase = createClient();

  if (typeof window !== "undefined" && !navigator.onLine) {
    const [offlineProducts, offlineInventory] = await Promise.all([
      getAllFromOfflineDB<any>("products"),
      getAllFromOfflineDB<any>("inventory"),
    ]);

    const queryText = query.trim().toLowerCase();
    const inventoryByWarehouse = new Map(
      offlineInventory
        .filter((entry: any) => entry.warehouse_id === warehouseId)
        .map((entry: any) => [entry.product_id, entry.quantity]),
    );

    return offlineProducts
      .filter((product: any) => product?.status === "active")
      .filter((product: any) => {
        if (!queryText) return true;
        return [product?.name, product?.sku, product?.barcode]
          .filter(Boolean)
          .some((value: string) =>
            String(value).toLowerCase().includes(queryText),
          );
      })
      .map((product: any) => ({
        ...product,
        available_quantity: inventoryByWarehouse.get(product.id) ?? 0,
      }))
      .slice(0, 20);
  }

  try {
    let q = supabase
      .from("products")
      .select(
        `
        *,
        category:categories(name),
        inventory!inner(quantity, warehouse_id)
      `,
      )
      .eq("status", "active")
      .eq("inventory.warehouse_id", warehouseId)
      .gt("inventory.quantity", 0);

    if (query) {
      q = q.or(
        `name.ilike.%${query}%,sku.ilike.%${query}%,barcode.eq.${query}`,
      );
    }

    const { data } = await q.limit(20);
    return (data || []).map((p: any) => ({
      ...p,
      available_quantity: p.inventory?.[0]?.quantity || 0,
    }));
  } catch {
    const [offlineProducts, offlineInventory] = await Promise.all([
      getAllFromOfflineDB<any>("products"),
      getAllFromOfflineDB<any>("inventory"),
    ]);

    const queryText = query.trim().toLowerCase();
    const inventoryByWarehouse = new Map(
      offlineInventory
        .filter((entry: any) => entry.warehouse_id === warehouseId)
        .map((entry: any) => [entry.product_id, entry.quantity]),
    );

    return offlineProducts
      .filter((product: any) => product?.status === "active")
      .filter((product: any) => {
        if (!queryText) return true;
        return [product?.name, product?.sku, product?.barcode]
          .filter(Boolean)
          .some((value: string) =>
            String(value).toLowerCase().includes(queryText),
          );
      })
      .map((product: any) => ({
        ...product,
        available_quantity: inventoryByWarehouse.get(product.id) ?? 0,
      }))
      .slice(0, 20);
  }
}

async function fetchWarehouses() {
  const supabase = createClient();

  if (typeof window !== "undefined" && !navigator.onLine) {
    return (await getAllFromOfflineDB<Warehouse>("warehouses")) || [];
  }

  try {
    const { data } = await supabase
      .from("warehouses")
      .select("*")
      .order("name");
    return (data as Warehouse[]) || [];
  } catch {
    return (await getAllFromOfflineDB<Warehouse>("warehouses")) || [];
  }
}

async function completeSale(payload: {
  cashier_id: string;
  organization_id: string;
  warehouse_id: string;
  customer_name?: string;
  customer_phone?: string;
  items: Array<{
    product_id: string;
    warehouse_id: string;
    quantity: number;
    unit_price: number;
    cost_price: number;
    discount: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amount_paid: number;
  change_amount: number;
  payment_method: string;
  notes?: string;
  receipt_url?: string;
}) {
  const invoiceNumber = `INV-${String(Date.now()).slice(-6)}`;
  // Always commit locally first. A stale `navigator.onLine` state must never
  // block checkout or prevent a receipt from being available.
  const saleRecord = await persistOfflineSale({ ...payload, invoice_number: invoiceNumber });

  return {
    id: saleRecord.id,
    invoice_number: saleRecord.invoice_number,
    subtotal: saleRecord.subtotal,
    discount: saleRecord.discount,
    tax: saleRecord.tax,
    total: saleRecord.total,
    amount_paid: saleRecord.amount_paid,
    change_amount: saleRecord.change_amount,
    payment_method: saleRecord.payment_method,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    notes: payload.notes,
    receipt_url: payload.receipt_url,
    created_at: saleRecord.created_at,
  };
}

export default function POSPage() {
  return (
    <AccessGuard allow={["business_owner", "admin", "cashier"]}>
      <POSPageInner />
    </AccessGuard>
  );
}

function POSPageInner() {
  const { user } = useAuthStore();
  const { organizationName, organizationAddress, organizationPhone, currency } =
    useOrgStore();
  const { t } = useI18n();
  const cart = useCartStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState("");
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<Record<string, unknown> | null>(
    null,
  );
  const [lastSaleItems, setLastSaleItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const printer = usePrinter();
  const [showPrinterMenu, setShowPrinterMenu] = useState(false);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-pos"],
    queryFn: fetchWarehouses,
  });

  // Set default warehouse
  React.useEffect(() => {
    if (warehouses.length > 0 && !cart.warehouse_id) {
      const main =
        warehouses.find((w: Warehouse) => w.is_main) || warehouses[0];
      cart.setWarehouse(main.id);
    }
  }, [warehouses, cart]);

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["pos-products", searchQuery, cart.warehouse_id],
    queryFn: () => searchProducts(searchQuery, cart.warehouse_id),
    enabled: !!cart.warehouse_id,
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const saleMutation = useMutation({
    mutationFn: completeSale,
    onSuccess: (sale) => {
      setLastSale(sale);
      setShowReceipt(true);
      cart.clearCart();
      setAmountPaid("");
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setPaymentReceiptUrl("");
      toast.success(
        t.pos.sale_completed_toast.replace("{invoice}", sale.invoice_number),
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t.pos.complete_sale_failed,
      );
    },
  });

  const handleAddToCart = useCallback(
    (product: Product & { available_quantity: number }) => {
      const existingItem = cart.items.find(
        (i: CartItem) => i.product.id === product.id,
      );
      const currentQty = existingItem?.quantity || 0;

      if (currentQty >= product.available_quantity) {
        toast.error(
          t.pos.only_units_available.replace(
            "{count}",
            String(product.available_quantity),
          ),
        );
        return;
      }

      cart.addItem({
        product,
        quantity: 1,
        unit_price: product.selling_price,
        warehouse_id: cart.warehouse_id,
      });
    },
    [cart],
  );

  const handleCheckout = () => {
    if (!user) return toast.error(t.pos.not_authenticated);
    if (cart.items.length === 0) return toast.error(t.pos.cart_is_empty_toast);

    const total = cart.getTotal();
    const paid = parseFloat(amountPaid) || 0;

    if (cart.payment_method !== "partial" && paid < total) {
      toast.error(t.pos.amount_less_than_total);
      return;
    }

    const { data: profile } = { data: { organization_id: "" } };

    // Get org_id from user store
    const orgId = (user as unknown as { organization_id: string })
      ?.organization_id;

    // Snapshot the cart items now — cart.clearCart() runs in onSuccess right
    // after the mutation resolves, and the receipt (on-screen, PDF, and
    // thermal print) all need product names/prices that the sale payload
    // itself doesn't carry (it only has product_id).
    setLastSaleItems([...cart.items]);

    saleMutation.mutate({
      cashier_id: user.id,
      organization_id: orgId,
      warehouse_id: cart.warehouse_id,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      items: cart.items.map((item: CartItem) => ({
        product_id: item.product.id,
        warehouse_id: item.warehouse_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        cost_price: item.product.cost_price,
        discount: item.discount,
        total: item.unit_price * item.quantity * (1 - item.discount / 100),
      })),
      subtotal: cart.getSubtotal(),
      discount: cart.getDiscountAmount(),
      tax: cart.getTaxAmount(),
      total,
      amount_paid: paid || total,
      change_amount: Math.max(0, paid - total),
      payment_method: cart.payment_method,
      notes: notes || undefined,
      receipt_url: paymentReceiptUrl || undefined,
    });
  };

  const subtotal = isHydrated ? cart.getSubtotal() : 0;
  const discountAmount = isHydrated ? cart.getDiscountAmount() : 0;
  const taxAmount = isHydrated ? cart.getTaxAmount() : 0;
  const total = isHydrated ? cart.getTotal() : 0;
  const paid = isHydrated ? parseFloat(amountPaid) || 0 : 0;
  const change = isHydrated ? Math.max(0, paid - total) : 0;

  const receiptData: ReceiptData | null =
    lastSale && lastSaleItems.length > 0
      ? buildReceiptData({
          sale: {
            invoice_number: String(lastSale.invoice_number ?? ""),
            subtotal: Number(lastSale.subtotal ?? 0),
            discount: Number(lastSale.discount ?? 0),
            tax: Number(lastSale.tax ?? 0),
            total: Number(lastSale.total ?? 0),
            amount_paid: Number(lastSale.amount_paid ?? 0),
            change_amount: Number(lastSale.change_amount ?? 0),
            payment_method: String(lastSale.payment_method ?? ""),
            customer_name: lastSale.customer_name as string | undefined,
            customer_phone: lastSale.customer_phone as string | undefined,
            notes: lastSale.notes as string | undefined,
            created_at: lastSale.created_at as string | undefined,
          },
          items: lastSaleItems,
          orgName: organizationName,
          orgAddress: organizationAddress || undefined,
          orgPhone: organizationPhone || undefined,
          cashierName: user?.full_name,
          currency,
        })
      : null;

  const handleBrowserPrint = () => {
    // Uses the .print-only <Receipt> rendered below — the print stylesheet
    // (globals.css) hides everything else, so this produces a clean
    // receipt instead of a screenshot of the whole dashboard.
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!receiptData) return;
    void downloadReceiptPDF(receiptData);
  };

  const handleHardwarePrint = async () => {
    if (!receiptData) return;
    const printed = await printer.printReceipt(receiptData);
    if (printed) {
      toast.success("Receipt sent to printer");
    } else {
      toast.error("Print failed — falling back to browser print");
      handleBrowserPrint();
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 -m-4 lg:-m-6 p-4 lg:p-6">
      {/* Left: Products */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Search & Warehouse */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              ref={searchRef}
              placeholder={t.pos.search_product}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <Select
            value={isHydrated ? cart.warehouse_id : ""}
            onValueChange={cart.setWarehouse}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t.pos.select_warehouse} />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w: Warehouse) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto">
          {productsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Package className="h-12 w-12 opacity-30" />
              <p className="text-sm">
                {searchQuery
                  ? t.pos.no_products_found
                  : t.pos.select_warehouse_prompt}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map(
                (product: Product & { available_quantity: number }) => (
                  <button
                    key={product.id}
                    onClick={() => handleAddToCart(product)}
                    className="text-left border border-border rounded-lg p-3 hover:bg-accent hover:border-primary/50 transition-all group bg-card"
                  >
                    <div className="w-full aspect-square bg-muted rounded-md mb-2 flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          width={80}
                          height={80}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <Package className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs font-medium truncate">
                      {product.name}
                    </p>
                    <p className="text-sm font-bold text-primary mt-1">
                      {formatCurrency(product.selling_price)}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span
                        className={`text-xs ${product.available_quantity <= 5 ? "text-amber-500" : "text-muted-foreground"}`}
                      >
                        {product.available_quantity} {t.pos.units_left}
                      </span>
                      {product.available_quantity <= 5 && (
                        <AlertCircle className="h-3 w-3 text-amber-500" />
                      )}
                    </div>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 xl:w-96 flex flex-col bg-card border border-border rounded-xl overflow-hidden shrink-0">
        {/* Cart Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span className="font-semibold">{t.pos.cart}</span>
            {isHydrated && cart.items.length > 0 && (
              <Badge variant="secondary">{cart.items.length}</Badge>
            )}
          </div>
          {cart.items.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={cart.clearCart}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!isHydrated ? (
            <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 opacity-30 mb-2 animate-spin" />
              <p className="text-sm">Loading cart…</p>
            </div>
          ) : cart.items.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
              <ShoppingCart className="h-8 w-8 opacity-30 mb-2" />
              <p className="text-sm">{t.pos.empty_cart}</p>
              <p className="text-xs">{t.pos.click_products_to_add}</p>
            </div>
          ) : (
            cart.items.map((item: CartItem) => (
              <div
                key={item.product.id}
                className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(item.unit_price)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      cart.updateQuantity(item.product.id, item.quantity - 1)
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-7 text-center text-sm font-medium">
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      cart.updateQuantity(item.product.id, item.quantity + 1)
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => cart.removeItem(item.product.id)}
                    className="text-destructive hover:text-destructive ml-1"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-right shrink-0 w-16">
                  <p className="text-xs font-semibold">
                    {formatCurrency(item.unit_price * item.quantity)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout Panel */}
        <div className="p-4 border-t border-border space-y-3">
          {/* Customer */}
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={t.pos.customer_name_short}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              placeholder={t.pos.phone_short}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Payment Method */}
          <Select
            value={cart.payment_method}
            onValueChange={(v) =>
              cart.setPaymentMethod(
                v as import("@/lib/supabase/types").PaymentMethod,
              )
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">{t.pos.cash}</SelectItem>
              <SelectItem value="transfer">{t.pos.bank_transfer}</SelectItem>
              <SelectItem value="pos_terminal">{t.pos.pos_terminal}</SelectItem>
              <SelectItem value="split">{t.pos.split}</SelectItem>
              <SelectItem value="partial">{t.pos.partial}</SelectItem>
            </SelectContent>
          </Select>

          {/* Optional payment receipt upload */}
          <div className="space-y-1">
            {paymentReceiptUrl ? (
              <div className="flex items-center justify-between rounded-md border border-border p-2 text-xs">
                <span className="text-green-600">{t.pos.receipt_uploaded}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => setPaymentReceiptUrl("")}
                >
                  {t.pos.remove}
                </Button>
              </div>
            ) : (
              <label className="flex items-center gap-2 rounded-md border border-dashed border-border p-2 text-xs cursor-pointer hover:bg-muted/50">
                {isUploadingReceipt ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>{t.pos.upload_receipt}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={isUploadingReceipt}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (!requireOnline("Receipt upload")) return;
                    setIsUploadingReceipt(true);
                    try {
                      const supabase = createClient();
                      const {
                        data: { user: authUser },
                      } = await supabase.auth.getUser();
                      if (!authUser) throw new Error("Not authenticated");
                      const path = `${authUser.id}/pos-${generateId()}-${Date.now()}.${file.name.split(".").pop() || "jpg"}`;
                      const { error: uploadErr } = await supabase.storage
                        .from("receipts")
                        .upload(path, file, { upsert: true });
                      if (uploadErr) throw uploadErr;
                      const { data: signed } = await supabase.storage
                        .from("receipts")
                        .createSignedUrl(path, 60 * 60 * 24 * 365);
                      setPaymentReceiptUrl(signed?.signedUrl || path);
                      toast.success(t.pos.receipt_uploaded);
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : t.pos.upload_failed,
                      );
                    } finally {
                      setIsUploadingReceipt(false);
                    }
                  }}
                />
              </label>
            )}
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{t.pos.subtotal}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {cart.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>
                  {t.pos.discount} ({cart.discount}%)
                </span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {cart.tax_rate > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {t.pos.tax} ({cart.tax_rate}%)
                </span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-border pt-2">
              <span>{t.common.total}</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Amount Paid */}
          <div className="space-y-1">
            <Label className="text-xs">{t.pos.amount_paid_currency}</Label>
            <Input
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder={total.toString()}
              className="h-9"
            />
            {paid > 0 && paid >= total && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                {t.pos.change}: {formatCurrency(change)}
              </p>
            )}
          </div>

          {/* Complete Sale Button */}
          <Button
            className="w-full h-10"
            onClick={handleCheckout}
            disabled={
              !isHydrated ||
              cart.items.length === 0 ||
              saleMutation.isPending ||
              isUploadingReceipt
            }
          >
            {saleMutation.isPending ? (
              <>{t.pos.processing}</>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                {t.pos.complete_sale}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-bold text-lg">{t.pos.sale_complete}</h3>
              <p className="text-sm text-muted-foreground">
                {t.pos.invoice_label}: {String(lastSale.invoice_number)}
              </p>
              <p className="text-2xl font-bold text-primary mt-2">
                {formatCurrency(Number(lastSale.total))}
              </p>
            </div>

            {/* Primary print/export actions */}
            <div className="flex gap-3 mb-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleBrowserPrint}
              >
                <Printer className="h-4 w-4 mr-2" />
                {t.common.print}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDownloadPDF}
              >
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>

            {/* Hardware thermal-printer options — only shown when a printer
                is connected, or lets the trader connect one on the spot.
                Hidden entirely if neither WebUSB nor WebBluetooth are
                supported (e.g. iPhone Safari), since there's nothing useful
                to offer there beyond the browser print/PDF above. */}
            {(printer.usbSupported || printer.bluetoothSupported) && (
              <div className="mb-3 border rounded-lg p-3 bg-muted/30">
                {printer.isConnected ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      {printer.transport === "usb" ? (
                        <Usb className="h-4 w-4 shrink-0 text-green-600" />
                      ) : (
                        <Bluetooth className="h-4 w-4 shrink-0 text-green-600" />
                      )}
                      <span className="truncate">{printer.deviceName}</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleHardwarePrint}
                      disabled={printer.status === "printing"}
                    >
                      {printer.status === "printing" ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4 mr-1.5" />
                      )}
                      Print to device
                    </Button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline w-full text-left"
                      onClick={() => setShowPrinterMenu((v) => !v)}
                    >
                      {printer.status === "connecting"
                        ? "Connecting…"
                        : "Connect a receipt printer (USB / Bluetooth)"}
                    </button>
                    {showPrinterMenu && (
                      <div className="flex gap-2 mt-2">
                        {printer.usbSupported && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={printer.connectUsb}
                            disabled={printer.status === "connecting"}
                          >
                            <Usb className="h-4 w-4 mr-1.5" />
                            USB
                          </Button>
                        )}
                        {printer.bluetoothSupported && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={printer.connectBluetooth}
                            disabled={printer.status === "connecting"}
                          >
                            <Bluetooth className="h-4 w-4 mr-1.5" />
                            Bluetooth
                          </Button>
                        )}
                      </div>
                    )}
                    {printer.error && (
                      <p className="text-xs text-destructive mt-1.5">
                        {printer.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => {
                setShowReceipt(false);
                setLastSale(null);
                setLastSaleItems([]);
              }}
            >
              {t.pos.new_sale}
            </Button>
          </div>
        </div>
      )}

      {/* Print-only receipt — invisible on screen, the only thing shown by
          window.print() thanks to the .print-only/.no-print rules in
          globals.css. Rendered whenever we have data so it's ready the
          instant handleBrowserPrint() is called. */}
      {receiptData && <Receipt data={receiptData} />}
    </div>
  );
}
