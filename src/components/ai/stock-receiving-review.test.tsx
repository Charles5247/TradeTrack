// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ receive: vi.fn() }));
vi.mock('@/lib/inventory/receive-stock', () => ({ receiveStockAtCost: mock.receive }));
vi.mock('@/store', () => ({ useAuthStore: (pick: (state: { user: { id: string; role: string; organization_id: string } }) => unknown) => pick({ user: { id: 'owner', role: 'business_owner', organization_id: 'org' } }) }));
vi.mock('@/i18n/text', () => ({ useCopy: () => (value: string) => value }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: (table: string) => ({
  select: () => ({ eq: () => ({ range: async () => ({ error: null, data: table === 'products'
    ? [{ id: 'product', organization_id: 'org', name: 'Rice', sku: 'RICE', barcode: null, stock_unit: 'bag', cost_price: 100 }]
    : [{ id: 'warehouse', organization_id: 'org', name: 'Main', is_main: true }] }) }) }),
}) }) }));
import { StockReceivingReview } from './stock-receiving-review';

it('requires owner selection and an exact-effects review before stock is received', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.receive.mockReset().mockResolvedValue({ offline: false, averageCost: 120 });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<StockReceivingReview job="job-1" rows={[{ name: 'Rice', sku: 'RICE', opening_stock: '4', cost_price: '150' }]} />));
    expect(host.textContent).toContain('Ready to select');
    expect(mock.receive).not.toHaveBeenCalled();
    const checkbox = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).find(input => input.parentElement?.textContent?.includes('Include this row'))!;
    await act(() => checkbox.click());
    expect(mock.receive).not.toHaveBeenCalled();
    await act(() => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Review exact stock changes')!.click());
    expect(host.textContent).toContain('Rice: +4 bag at ₦150 each → Main');
    expect(mock.receive).not.toHaveBeenCalled();
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Apply 1 stock receipt')!.click());
    expect(mock.receive).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'product', warehouse_id: 'warehouse', quantity: 4, unit_cost: 150, receipt_id: expect.any(String) }));
    expect(host.textContent).toContain('Applied');
  } finally { await act(() => root.unmount()); host.remove(); }
});
