import type { ImportRow } from '@/lib/imports/preview';

export type PurchaseOrderLine = { id: string; product_id: string; quantity_ordered: number;
  quantity_received: number; unit_cost: number; product: { name: string; sku: string; stock_unit: string } };

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();

/** A deterministic review of invoice extraction. Ambiguous names are never assigned to a PO line. */
export function matchInvoiceToOrder(rows: ImportRow[], lines: PurchaseOrderLine[]) {
  const used = new Set<string>();
  const matched = rows.map((row, index) => {
    const sku = normalize(row.sku);
    const name = normalize(row.name);
    const candidates = sku ? lines.filter(line => normalize(line.product.sku) === sku)
      : name ? lines.filter(line => normalize(line.product.name) === name) : [];
    const line = candidates.length === 1 ? candidates[0] : null;
    const quantity = Number(row.opening_stock);
    const unitCost = Number(row.cost_price);
    const validQuantity = row.opening_stock !== '' && Number.isSafeInteger(quantity) && quantity > 0;
    const validCost = row.cost_price !== '' && Number.isFinite(unitCost) && unitCost >= 0;
    const invoiceUnit = normalize(row.stock_unit);
    const unitComparable = !invoiceUnit || (invoiceUnit !== 'unknown' && (!line || invoiceUnit === normalize(line.product.stock_unit)));
    const remaining = line ? Number(line.quantity_ordered) - Number(line.quantity_received) : null;
    const duplicate = line ? used.has(line.id) : false;
    if (line) used.add(line.id);
    const issues = [
      ...(candidates.length > 1 ? ['Several PO lines match; choose manually.'] : []),
      ...(!line ? ['Not matched to this purchase order.'] : []),
      ...(!unitComparable ? ['Confirm the invoice unit and pack size before comparing quantities or costs.'] : []),
      ...(!validQuantity ? ['Check the invoice quantity.'] : []),
      ...(!validCost ? ['Check the invoice buying cost per unit.'] : []),
      ...(duplicate ? ['This PO line appears more than once on the invoice.'] : []),
      ...(line && unitComparable && validQuantity && quantity > remaining! ? ['Invoice quantity exceeds the unreceived order quantity.'] : []),
    ];
    return { index, name: String(row.name || '').trim(), sku: String(row.sku || '').trim(),
      quantity: validQuantity ? quantity : null, unitCost: validCost ? unitCost : null,
      lineId: line?.id || null, ordered: line?.quantity_ordered ?? null, remaining,
      orderedUnitCost: line?.unit_cost ?? null,
      costDifference: line && unitComparable && validCost ? unitCost - Number(line.unit_cost) : null,
      unitComparable, issues, source: row };
  });
  const short = lines.filter(line => !matched.some(row => row.lineId === line.id && !row.unitComparable))
    .filter(line => !matched.some(row => row.lineId === line.id && row.quantity === line.quantity_ordered - line.quantity_received))
    .map(line => ({ name: line.product.name, remaining: Number(line.quantity_ordered) - Number(line.quantity_received),
      onInvoice: matched.filter(row => row.lineId === line.id).reduce((sum, row) => sum + (row.quantity || 0), 0) }))
    .filter(line => line.remaining > line.onInvoice);
  const invoiceValue = matched.every(row => row.unitComparable && row.quantity !== null && row.unitCost !== null)
    ? matched.reduce((sum, row) => sum + row.quantity! * row.unitCost!, 0) : null;
  return { matched, short, invoiceValue,
    orderOutstandingValue: lines.reduce((sum, line) => sum + (line.quantity_ordered - line.quantity_received) * Number(line.unit_cost), 0),
    ready: matched.length > 0 && matched.every(row => row.issues.length === 0) };
}
