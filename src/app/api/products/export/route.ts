import { apiContext } from '@/lib/auth/api-context';
import { productCsv, type ExportProduct } from '@/lib/products/export-csv';

export async function GET() {
  try {
    const { db, org, profile } = await apiContext(['business_owner', 'admin']);
    const assigned = profile.role === 'admin'
      ? await db.from('warehouse_staff').select('warehouse_id').eq('organization_id', org).eq('user_id', profile.id)
      : null;
    if (assigned?.error) throw assigned.error;
    const warehouseIds = assigned?.data?.map(row => row.warehouse_id) ?? null;
    const products: ExportProduct[] = [];
    if (warehouseIds === null || warehouseIds.length > 0) {
      for (let start = 0; ; start += 500) {
        let query = db.from('products')
          .select(`name,sku,barcode,stock_unit,selling_price,cost_price,status,category:categories(name),inventory${warehouseIds ? '!inner' : ''}(quantity,warehouse_id,warehouse:warehouses(name))`)
          .eq('organization_id', org).order('name').order('id').range(start, start + 499);
        if (warehouseIds) query = query.in('inventory.warehouse_id', warehouseIds);
        const { data, error } = await query;
        if (error) throw error;
        products.push(...(data || []) as unknown as ExportProduct[]);
        if (!data || data.length < 500) break;
      }
    }
    return new Response(productCsv(products), { headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="Trackasuwa-products-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Could not export products' }, { status: 403 });
  }
}
