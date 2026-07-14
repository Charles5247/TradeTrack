'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, X, CreditCard,
  Printer, Package, AlertCircle, Check, Barcode,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/format';
import { useCartStore, useAuthStore } from '@/store';
import type { Product, Warehouse, CartItem } from '@/types';
import Image from 'next/image';

async function searchProducts(query: string, warehouseId: string) {
  const supabase = createClient();
  let q = supabase
    .from('products')
    .select(`
      *,
      category:categories(name),
      inventory!inner(quantity, warehouse_id)
    `)
    .eq('status', 'active')
    .eq('inventory.warehouse_id', warehouseId)
    .gt('inventory.quantity', 0);

  if (query) {
    q = q.or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.eq.${query}`);
  }

  const { data } = await q.limit(20);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((p: any) => ({
    ...p,
    available_quantity: p.inventory?.[0]?.quantity || 0,
  }));
}

async function fetchWarehouses() {
  const supabase = createClient();
  const { data } = await supabase.from('warehouses').select('*').order('name');
  return data as Warehouse[] || [];
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
}) {
  const supabase = createClient();

  // Generate invoice number
  const { data: maxInvoice } = await supabase
    .from('sales')
    .select('invoice_number')
    .eq('organization_id', payload.organization_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const lastNum = maxInvoice
    ? parseInt(maxInvoice.invoice_number.replace('INV-', '')) || 1000
    : 1000;
  const invoiceNumber = `INV-${String(lastNum + 1).padStart(6, '0')}`;

  // Create sale
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      organization_id: payload.organization_id,
      invoice_number: invoiceNumber,
      cashier_id: payload.cashier_id,
      warehouse_id: payload.warehouse_id,
      customer_name: payload.customer_name || null,
      customer_phone: payload.customer_phone || null,
      subtotal: payload.subtotal,
      discount: payload.discount,
      tax: payload.tax,
      total: payload.total,
      amount_paid: payload.amount_paid,
      change_amount: payload.change_amount,
      payment_method: payload.payment_method as import('@/lib/supabase/types').PaymentMethod,
      payment_status: payload.amount_paid >= payload.total ? 'paid' : 'partial',
      status: 'completed',
      notes: payload.notes || null,
    })
    .select()
    .single();

  if (saleError) throw saleError;

  // Create sale items
  const itemsPayload = payload.items.map((item) => ({
    sale_id: sale.id,
    product_id: item.product_id,
    warehouse_id: item.warehouse_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    cost_price: item.cost_price,
    discount: item.discount,
    total: item.total,
  }));

  const { error: itemsError } = await supabase.from('sale_items').insert(itemsPayload);
  if (itemsError) throw itemsError;

  // Deduct inventory for each item
  for (const item of payload.items) {
    const { data: inv } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('product_id', item.product_id)
      .eq('warehouse_id', item.warehouse_id)
      .single();

    if (inv) {
      await supabase
        .from('inventory')
        .update({ quantity: Math.max(0, inv.quantity - item.quantity) })
        .eq('product_id', item.product_id)
        .eq('warehouse_id', item.warehouse_id);

      // Record movement
      await supabase.from('inventory_movements').insert({
        organization_id: payload.organization_id,
        product_id: item.product_id,
        warehouse_id: item.warehouse_id,
        movement_type: 'sale',
        quantity: -item.quantity,
        reference_id: sale.id,
        reference_type: 'sale',
        created_by: payload.cashier_id,
      });
    }
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: payload.organization_id,
    user_id: payload.cashier_id,
    action: 'CREATE_SALE',
    resource_type: 'sale',
    resource_id: sale.id,
    new_values: { invoice_number: invoiceNumber, total: payload.total, items_count: payload.items.length },
  });

  return sale;
}

export default function POSPage() {
  const { user } = useAuthStore();
  const cart = useCartStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<Record<string, unknown> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses-pos'],
    queryFn: fetchWarehouses,
  });

  // Set default warehouse
  React.useEffect(() => {
    if (warehouses.length > 0 && !cart.warehouse_id) {
      const main = warehouses.find((w: Warehouse) => w.is_main) || warehouses[0];
      cart.setWarehouse(main.id);
    }
  }, [warehouses, cart]);

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['pos-products', searchQuery, cart.warehouse_id],
    queryFn: () => searchProducts(searchQuery, cart.warehouse_id),
    enabled: !!cart.warehouse_id,
  });

  const saleMutation = useMutation({
    mutationFn: completeSale,
    onSuccess: (sale) => {
      setLastSale(sale);
      setShowReceipt(true);
      cart.clearCart();
      setAmountPaid('');
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      toast.success(`Sale completed! Invoice: ${sale.invoice_number}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to complete sale');
    },
  });

  const handleAddToCart = useCallback((product: Product & { available_quantity: number }) => {
    const existingItem = cart.items.find((i: CartItem) => i.product.id === product.id);
    const currentQty = existingItem?.quantity || 0;

    if (currentQty >= product.available_quantity) {
      toast.error(`Only ${product.available_quantity} units available`);
      return;
    }

    cart.addItem({
      product,
      quantity: 1,
      unit_price: product.selling_price,
      warehouse_id: cart.warehouse_id,
    });
  }, [cart]);

  const handleCheckout = () => {
    if (!user) return toast.error('Not authenticated');
    if (cart.items.length === 0) return toast.error('Cart is empty');

    const total = cart.getTotal();
    const paid = parseFloat(amountPaid) || 0;

    if (cart.payment_method !== 'partial' && paid < total) {
      toast.error('Amount paid is less than the total');
      return;
    }

    const { data: profile } = { data: { organization_id: '' } };

    // Get org_id from user store
    const orgId = (user as unknown as { organization_id: string })?.organization_id;

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
    });
  };

  const total = cart.getTotal();
  const paid = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paid - total);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 -m-4 lg:-m-6 p-4 lg:p-6">
      {/* Left: Products */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Search & Warehouse */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              ref={searchRef}
              placeholder="Search product or scan barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <Select value={cart.warehouse_id} onValueChange={cart.setWarehouse}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w: Warehouse) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
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
                {searchQuery ? 'No products found' : 'Select a warehouse to see products'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((product: Product & { available_quantity: number }) => (
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
                  <p className="text-xs font-medium truncate">{product.name}</p>
                  <p className="text-sm font-bold text-primary mt-1">
                    {formatCurrency(product.selling_price)}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-xs ${product.available_quantity <= 5 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {product.available_quantity} left
                    </span>
                    {product.available_quantity <= 5 && (
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                    )}
                  </div>
                </button>
              ))}
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
            <span className="font-semibold">Cart</span>
            {cart.items.length > 0 && (
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
          {cart.items.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
              <ShoppingCart className="h-8 w-8 opacity-30 mb-2" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs">Click products to add them</p>
            </div>
          ) : (
            cart.items.map((item: CartItem) => (
              <div
                key={item.product.id}
                className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(item.unit_price)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => cart.updateQuantity(item.product.id, item.quantity - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-7 text-center text-sm font-medium">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => cart.updateQuantity(item.product.id, item.quantity + 1)}
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
              placeholder="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Payment Method */}
          <Select
            value={cart.payment_method}
            onValueChange={(v) => cart.setPaymentMethod(v as import('@/lib/supabase/types').PaymentMethod)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="transfer">Bank Transfer</SelectItem>
              <SelectItem value="pos_terminal">POS Terminal</SelectItem>
              <SelectItem value="split">Split Payment</SelectItem>
              <SelectItem value="partial">Partial Payment</SelectItem>
            </SelectContent>
          </Select>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(cart.getSubtotal())}</span>
            </div>
            {cart.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount ({cart.discount}%)</span>
                <span>-{formatCurrency(cart.getDiscountAmount())}</span>
              </div>
            )}
            {cart.tax_rate > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({cart.tax_rate}%)</span>
                <span>{formatCurrency(cart.getTaxAmount())}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-border pt-2">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Amount Paid */}
          <div className="space-y-1">
            <Label className="text-xs">Amount Paid (₦)</Label>
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
                Change: {formatCurrency(change)}
              </p>
            )}
          </div>

          {/* Complete Sale Button */}
          <Button
            className="w-full h-10"
            onClick={handleCheckout}
            disabled={cart.items.length === 0 || saleMutation.isPending}
          >
            {saleMutation.isPending ? (
              <>Processing...</>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Complete Sale
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-bold text-lg">Sale Complete!</h3>
              <p className="text-sm text-muted-foreground">
                Invoice: {String(lastSale.invoice_number)}
              </p>
              <p className="text-2xl font-bold text-primary mt-2">
                {formatCurrency(Number(lastSale.total))}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setShowReceipt(false);
                  setLastSale(null);
                }}
              >
                New Sale
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
