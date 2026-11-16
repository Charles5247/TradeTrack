import type { BusinessAggregate } from './types';

/** Fixed, disjoint 30-day windows. Figures are computed from merchant records, never by the model. */
export function periodComparison(products: Array<{ id: string; name: string }>, sales: Array<{
  created_at: string; total: number; sale_items?: Array<{ product_id: string; quantity: number; unit_price?: number }>;
}>, now = Date.now()): NonNullable<BusinessAggregate['comparison']> {
  const day = 86400000;
  const boundary = now - 30 * day;
  const earlier = now - 60 * day;
  const current = sales.filter(s => Date.parse(s.created_at) >= boundary && Date.parse(s.created_at) <= now);
  const previous = sales.filter(s => Date.parse(s.created_at) >= earlier && Date.parse(s.created_at) < boundary);
  const revenue = (rows: typeof sales) => rows.reduce((total, sale) => total + Number(sale.total), 0);
  const currentRevenue = revenue(current);
  const previousRevenue = revenue(previous);
  const names = new Map(products.map(product => [product.id, product.name]));
  const items = new Map<string, { name: string; units: number; revenue: number }>();
  for (const sale of current) for (const item of sale.sale_items || []) {
    const entry = items.get(item.product_id) || { name: names.get(item.product_id) || 'Unknown product', units: 0, revenue: 0 };
    entry.units += Number(item.quantity);
    entry.revenue += Number(item.quantity) * Number(item.unit_price || 0);
    items.set(item.product_id, entry);
  }
  const date = (timestamp: number) => new Date(timestamp).toISOString();
  return {
    current: { from: date(boundary), to: date(now), sales: current.length, revenue: currentRevenue },
    previous: { from: date(earlier), to: date(boundary), sales: previous.length, revenue: previousRevenue },
    changePercent: previousRevenue > 0 ? Math.round((currentRevenue - previousRevenue) / previousRevenue * 1000) / 10 : null,
    missingItemSales: current.filter(s => !s.sale_items?.length).length,
    topProducts: [...items.values()].sort((a, b) => b.revenue - a.revenue || b.units - a.units).slice(0, 5),
  };
}

/** Deterministic numbers; the model explains these rather than inventing metrics. */
export function recentAnalysis(products: any[], inventory: any[], sales: any[], now = Date.now()): BusinessAggregate['analysis'] {
  const day = 86400000;
  const recent = sales.filter(s => Date.parse(s.created_at) >= now - 30 * day && Date.parse(s.created_at) <= now);
  const observedDays = recent.length ? Math.min(30, Math.max(1, Math.ceil((now - Math.min(...recent.map(s => Date.parse(s.created_at)))) / day))) : 0;
  const units = new Map<string, number>();
  const staff = new Map<string, { label: string; salesTotal: number; transactions: number; averageSale: number }>();
  for (const sale of recent) {
    for (const item of sale.sale_items || []) units.set(item.product_id, (units.get(item.product_id) || 0) + Number(item.quantity));
    const entry = staff.get(sale.cashier_id) || { label: `Cashier ${staff.size + 1}`, salesTotal: 0, transactions: 0, averageSale: 0 };
    entry.salesTotal += Number(sale.total); entry.transactions++; entry.averageSale = entry.salesTotal / entry.transactions;
    staff.set(sale.cashier_id, entry);
  }
  return {
    windowDays: 30, observedDays, salesTotal: recent.reduce((sum, s) => sum + Number(s.total), 0), saleCount: recent.length,
    products: products.map(p => {
      const stock = inventory.filter(i => i.product_id === p.id).reduce((sum, i) => sum + Number(i.quantity), 0);
      const unitsSold = units.get(p.id) || 0;
      const dailyUnits = observedDays ? unitsSold / observedDays : 0;
      return { name: p.name, stock, unitsSold, dailyUnits, estimatedDaysLeft: observedDays >= 7 && dailyUnits > 0 ? Math.round(stock / dailyUnits * 10) / 10 : null };
    }).sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 200),
    staff: [...staff.values()].sort((a, b) => b.salesTotal - a.salesTotal).slice(0, 50),
    limitations: ['Cashier labels are anonymous within this report; no hours-worked data is available, so efficiency cannot be measured.', 'Stock coverage assumes the observed daily sales rate continues; it is an estimate, not a guarantee.', 'Product analysis is limited to 200 products by units sold; staff analysis to 50 cashiers.', 'Cancelled, refunded and reversed sales are excluded.'],
  };
}
