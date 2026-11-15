// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
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
  mock.fetch.mockReset().mockImplementation(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => options?.method === 'POST' ? { saved: true, average_cost: 120 }
      : { rows: [{ name: 'Rice', sku: 'RICE', opening_stock: '4', cost_price: '150' }], receipts: [] },
  }));
  vi.stubGlobal('fetch', mock.fetch);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<StockReceivingReview job="job-1" rows={[{ name: 'Rice', sku: 'RICE', opening_stock: '4', cost_price: '150' }]} />));
    expect(host.textContent).toContain('Ready to select');
    expect(mock.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    const checkbox = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).find(input => input.parentElement?.textContent?.includes('Include this row'))!;
    await act(() => checkbox.click());
    expect(mock.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    await act(() => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Review exact stock changes')!.click());
    expect(host.textContent).toContain('Rice: +4 bag at ₦150 buying cost each → Main');
    expect(mock.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Apply 1 stock receipt')!.click());
    const applyCall = mock.fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(applyCall?.[0]).toBe('/api/ai/stock-receipts');
    expect(JSON.parse(String(applyCall?.[1]?.body))).toEqual(expect.objectContaining({ product_id: 'product', warehouse_id: 'warehouse', quantity: 4, unit_cost: 150, row_index: 0, confirm: true }));
    expect(host.textContent).toContain('Applied');
  } finally { await act(() => root.unmount()); host.remove(); }
});

it('creates an unmatched product only after the owner supplies a selling price and confirms', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.fetch.mockReset().mockImplementation(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => options?.method === 'POST' ? { saved: true, product_id: 'created' }
      : { rows: [{ name: 'New Oil', sku: 'OIL-NEW', opening_stock: '3', cost_price: '900' }], receipts: [] },
  }));
  vi.stubGlobal('fetch', mock.fetch);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<StockReceivingReview job="job-2" rows={[{ name: 'New Oil', sku: 'OIL-NEW', opening_stock: '3', cost_price: '900' }]} />));
    expect(host.textContent).toContain('Create a new product');
    const include = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).find(input => input.parentElement?.textContent?.includes('Include this row'))!;
    expect(include.disabled).toBe(true);
    const selling = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find(input => input.closest('label')?.textContent?.includes('Selling price per unit'))!;
    await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(selling, '1200'); selling.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(include.disabled).toBe(false);
    await act(() => include.click());
    await act(() => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Review exact stock changes')!.click());
    expect(host.textContent).toContain('Create SKU OIL-NEW at ₦1,200 selling price');
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Apply 1 stock receipt')!.click());
    const applyCall = mock.fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(String(applyCall?.[1]?.body))).toEqual(expect.objectContaining({ mode: 'new', name: 'New Oil', sku: 'OIL-NEW', selling_price: 1200, quantity: 3, unit_cost: 900 }));
    expect(host.textContent).toContain('Applied');
  } finally { await act(() => root.unmount()); host.remove(); }
});
