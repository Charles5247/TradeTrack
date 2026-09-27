// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { getDB } from '../db';
import { persistOfflineVendorTransaction } from '../vendor-transactions';
const mocks = vi.hoisted(() => ({ from: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: { id: 'user', organization_id: 'org', role: 'business_owner' } }),
  useOrgStore: () => ({ organizationName: 'Shop' }),
}));
vi.mock('@/i18n', async () => {
  const { en } = await import('@/i18n/locales/en');
  return { useI18n: () => ({ t: new Proxy({}, { get: () => new Proxy({}, { get: (_target, key) =>
    String(key).startsWith('stock_check_') ? en.vendors[key as keyof typeof en.vendors] : String(key) }) }) }) };
});
vi.mock('@/components/shared/access-guard', () => ({ AccessGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/lib/pdf/receipt-pdf', () => ({ downloadReceiptPDF: vi.fn() }));
vi.mock('../sync-engine', () => ({ syncEngine: { subscribe: () => () => {}, sync: vi.fn(), pullVendorTransactions: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from }) }));
import VendorsPage from '@/app/(dashboard)/vendors/page';

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => { throw new TypeError('Failed to fetch'); });
  const db = await getDB();
  for (const store of ['vendor_transactions', 'vendor_transaction_items', 'sales', 'inventory', 'products', 'warehouses', 'sync_queue']) await db.clear(store);
});

it('renders cached vendors and gates payment offline and until the linked sale has synced', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  onlineManager.setOnline(false);
  const db = await getDB();
  await db.put('warehouses', { id: 'warehouse', organization_id: 'org', name: 'Main' });
  const vendor = await persistOfflineVendorTransaction({ organization_id: 'org', created_by: 'user', vendor_name: 'Cached Vendor',
    date_issued: '2026-09-25', items: [{ product_id: 'product', quantity: '2', unit_price: '10' }] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await db.put('products', { id: 'product', organization_id: 'org', name: 'Rice' });
  await db.put('sync_queue', { id: 'stock-check', table_name: 'inventory', record_id: 'stock', operation: 'UPDATE',
    status: 'pending', payload: { organization_id: 'org', product_id: 'product', quantity: 17 },
    stock_sync: { review_reason: 'server_stock_changed' } });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const pay = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'pay');
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 100 && !predicate(); i++) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    expect(predicate()).toBe(true);
  };
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><VendorsPage /></QueryClientProvider>));
    await waitFor(() => container.textContent?.includes('Cached Vendor') === true);
    await waitFor(() => container.textContent?.includes('This stock update needs a quick check') === true);
    expect(container.textContent).toContain('Count the items below and ask the shop owner');
    expect(container.textContent).toContain('Rice: saved quantity 17');
    expect(container.querySelector('a[href="/inventory"]')?.textContent).toBe('Open Inventory to check stock');
    expect(container.textContent).not.toMatch(/version mismatch|conflict/i);
    expect(pay()?.disabled).toBe(true);
    expect(container.textContent).toContain('Reconnect to record payment.');
    online.mockReturnValue(true);
    await act(async () => { onlineManager.setOnline(true); window.dispatchEvent(new Event('online')); });
    await waitFor(() => container.textContent?.includes('Waiting for this transaction') === true);
    await db.put('vendor_transactions', { ...vendor, synced: true });
    for (const item of await db.getAll('vendor_transaction_items')) await db.put('vendor_transaction_items', { ...item, synced: true });
    await act(async () => { await client.invalidateQueries({ queryKey: ['vendors'] }); });
    expect(pay()?.disabled).toBe(true);
    for (const sale of await db.getAll('sales')) await db.put('sales', { ...sale, synced: true });
    await act(async () => { await client.invalidateQueries({ queryKey: ['vendors'] }); });
    await waitFor(() => pay()?.disabled === false);
    await db.delete('sync_queue', 'stock-check');
    await act(async () => { await client.invalidateQueries({ queryKey: ['vendor-stock-checks'] }); });
    await waitFor(() => container.querySelector('[role="alert"]') === null);
  } finally {
    await act(async () => root.unmount()); client.clear(); container.remove(); online.mockRestore(); onlineManager.setOnline(true);
  }
});

it.each([
  { amount: 10, failure: '', status: 'partial', paymentStatus: 'partial' },
  { amount: 20, failure: '', status: 'completed', paymentStatus: 'paid' },
  { amount: 20, failure: 'sales', status: 'completed', paymentStatus: 'paid' },
  { amount: 20, failure: 'vendor_transactions', status: 'completed', paymentStatus: 'paid' },
])('records online payment $amount and surfaces failure at "$failure"', async ({ amount, failure, status, paymentStatus }) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  onlineManager.setOnline(true);
  const db = await getDB();
  await db.put('warehouses', { id: 'warehouse', organization_id: 'org', name: 'Main' });
  const vendor = await persistOfflineVendorTransaction({ organization_id: 'org', created_by: 'user', vendor_name: 'Payment Vendor',
    date_issued: '2026-09-25', items: [{ product_id: 'product', quantity: '2', unit_price: '10' }] });
  for (const store of ['vendor_transactions', 'vendor_transaction_items', 'sales']) {
    for (const row of await db.getAll(store)) await db.put(store, { ...row, synced: true });
  }
  const writes: { table: string; patch: Record<string, unknown>; filters: unknown[][] }[] = [];
  const forbiddenFilter = vi.fn(() => { throw new Error('deleted_at does not exist'); });
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { total_value: 20 }, error: null }) }) }),
    update: (patch: Record<string, unknown>) => {
      const write = { table, patch, filters: [] as unknown[][] }; writes.push(write);
      const result = { error: table === failure ? new Error(`${table} payment failed`) : null };
      return { eq: (...args: unknown[]) => { write.filters.push(args); return { ...result, is: forbiddenFilter }; } };
    },
  }));
  const queueBefore = await db.getAll('sync_queue');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 100 && !predicate(); i++) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    expect(predicate()).toBe(true);
  };
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><VendorsPage /></QueryClientProvider>));
    const pay = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'pay');
    await waitFor(() => !!pay() && !pay()!.disabled);
    await act(async () => pay()!.click());
    const input = document.querySelector('[role="dialog"] input[type="number"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(amount));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save payment')!;
    await act(async () => save.click());
    await waitFor(() => failure ? mocks.error.mock.calls.length > 0 : mocks.success.mock.calls.length > 0);
    expect(writes[0]).toMatchObject({ table: 'vendor_transactions', patch: { amount_paid: amount, status }, filters: [['id', vendor.id]] });
    if (failure === 'vendor_transactions') expect(writes).toHaveLength(1);
    else {
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual({ table: 'sales', patch: { amount_paid: amount, change_amount: 0,
        payment_status: paymentStatus, status: amount === 20 ? 'completed' : 'pending' },
        filters: [['notes', `Vendor transaction ${vendor.id}`]] });
    }
    expect(forbiddenFilter).not.toHaveBeenCalled();
    if (failure) {
      expect(mocks.error).toHaveBeenCalledWith(`${failure} payment failed`);
      expect(mocks.success).not.toHaveBeenCalled();
    } else {
      expect(mocks.success).toHaveBeenCalledWith('mark_paid');
      expect(mocks.error).not.toHaveBeenCalled();
    }
    expect(await db.getAll('sync_queue')).toEqual(queueBefore);
  } finally {
    await act(async () => root.unmount()); client.clear(); container.remove(); online.mockRestore();
  }
});
