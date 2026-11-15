import { csvCell } from '@/lib/accounting/reconciliation';

export type ExportProduct = {
  name: string; sku: string; barcode?: string | null; stock_unit?: string | null;
  selling_price: number; cost_price: number; status?: string | null;
  category?: { name?: string | null } | null;
  inventory?: Array<{ quantity: number; warehouse?: { name?: string | null } | null }>;
};

const columns = ['Product', 'SKU', 'Barcode', 'Category', 'Stock unit', 'Warehouse',
  'Quantity', 'Buying cost', 'Selling price', 'Status'];

export function productCsv(products: ExportProduct[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const product of products) {
    for (const stock of product.inventory?.length ? product.inventory : [{ quantity: 0, warehouse: null }]) {
      lines.push([
        product.name, product.sku, product.barcode || '', product.category?.name || '',
        product.stock_unit || 'piece', stock.warehouse?.name || '', stock.quantity,
        product.cost_price, product.selling_price, product.status || 'active',
      ].map(csvCell).join(','));
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
