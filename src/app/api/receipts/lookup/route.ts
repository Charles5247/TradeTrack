/**
 * TradeTrack - Receipt Barcode Lookup API
 *
 * GET /api/receipts/lookup?code=<barcodeValue>
 *
 * Every receipt TradeTrack prints (sales/vendor "Cash Receipt" and
 * warehouse "Stock Transfer Note") carries a scannable CODE128 barcode
 * encoding either the sale's invoice number or a synthesized transfer
 * reference (`TRF-XXXXXXXX`). This endpoint resolves that scanned value
 * back to the full record + item list so a barcode scanner (or the
 * in-app /receipts/lookup page) can look up "what was on this receipt".
 *
 * Access is scoped by the caller's Supabase session — RLS on `sales`
 * and `warehouse_transfers` already restricts rows to the caller's
 * organization (and, for cashiers, to their own sales), so this route
 * intentionally uses the anon-key/cookie-bound client rather than a
 * service-role client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/supabase/types';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')?.trim();
    if (!code) {
      return NextResponse.json({ error: 'Missing "code" query parameter' }, { status: 400 });
    }

    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A transfer reference always looks like TRF-XXXXXXXX (8 hex chars of
    // the transfer's UUID, uppercased) — see build-transfer-receipt.ts.
    // Anything else is treated as a sales invoice number.
    if (/^TRF-[A-F0-9]{6,}$/i.test(code)) {
      return await lookupTransfer(supabase, code);
    }
    return await lookupSale(supabase, code);
  } catch (err) {
    console.error('[GET /api/receipts/lookup]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function lookupSale(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  invoiceNumber: string
) {
  const { data: sale, error } = await supabase
    .from('sales')
    .select(
      `
      *,
      cashier:users(full_name),
      items:sale_items(
        id, quantity, unit_price, discount, total,
        product:products(name, sku)
      )
    `
    )
    .eq('invoice_number', invoiceNumber)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!sale) {
    return NextResponse.json({ error: 'No receipt found for this barcode' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sale as any;
  return NextResponse.json({
    kind: 'sale',
    receipt: {
      invoiceNumber: s.invoice_number,
      dateISO: s.created_at,
      cashierName: s.cashier?.full_name,
      customerName: s.customer_name,
      customerPhone: s.customer_phone,
      status: s.status,
      paymentStatus: s.payment_status,
      paymentMethod: s.payment_method,
      subtotal: s.subtotal,
      discount: s.discount,
      tax: s.tax,
      total: s.total,
      amountPaid: s.amount_paid,
      changeAmount: s.change_amount,
      notes: s.notes,
      items: (s.items || []).map((item: {
        quantity: number; unit_price: number; discount: number; total: number;
        product: { name?: string; sku?: string } | null;
      }) => ({
        name: item.product?.name || 'Item',
        sku: item.product?.sku,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        discount: item.discount,
        total: item.total,
      })),
    },
  });
}

async function lookupTransfer(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  transferRef: string
) {
  // The barcode encodes only the first 8 chars of the transfer UUID
  // (uppercased), so we match all transfers whose id starts with that
  // prefix (case-insensitive) rather than an exact id lookup.
  const idPrefix = transferRef.replace(/^TRF-/i, '').toLowerCase();

  const { data: transfers, error } = await supabase
    .from('warehouse_transfers')
    .select(
      `
      *,
      product:products(name, sku),
      from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey(name),
      to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey(name),
      sender:users!warehouse_transfers_sent_by_fkey(full_name),
      receiver:users!warehouse_transfers_received_by_fkey(full_name)
    `
    )
    .ilike('id', `${idPrefix}%`);

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (transfers as any[] | null)?.find((t) =>
    t.id.replace(/-/g, '').toLowerCase().startsWith(idPrefix)
  );

  if (!match) {
    return NextResponse.json({ error: 'No transfer found for this barcode' }, { status: 404 });
  }

  return NextResponse.json({
    kind: 'transfer',
    receipt: {
      transferRef: `TRF-${match.id.slice(0, 8).toUpperCase()}`,
      dateISO: match.date_sent,
      status: match.status,
      fromWarehouse: match.from_warehouse?.name,
      toWarehouse: match.to_warehouse?.name,
      initiatedBy: match.initiated_by,
      approvedBy: match.approved_by,
      coordinatedBy: match.coordinated_by,
      sentBy: match.sender?.full_name,
      receivedBy: match.receiver?.full_name,
      notes: match.notes,
      items: [
        {
          name: match.product?.name || 'Item',
          sku: match.product?.sku,
          quantity: match.quantity,
        },
      ],
    },
  });
}
