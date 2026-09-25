// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { getDB } from '../db';
import { persistOfflineVendorTransaction } from '../vendor-transactions';
vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: { id: 'user', organization_id: 'org', role: 'business_owner' } }),
  useOrgStore: () => ({ organizationName: 'Shop' }),
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: new Proxy({}, { get: () => new Proxy({}, { get: (_target, key) => String(key) }) }) }) }));
vi.mock('@/components/shared/access-guard', () => ({ AccessGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/lib/pdf/receipt-pdf', () => ({ downloadReceiptPDF: vi.fn() }));
vi.mock('../sync-engine', () => ({ syncEngine: { subscribe: () => () => {}, sync: vi.fn(), pullVendorTransactions: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => { throw new TypeError('Failed to fetch'); } }) }));
import VendorsPage from '@/app/(dashboard)/vendors/page';

it('renders cached vendors and gates payment offline and until the linked sale has synced', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  onlineManager.setOnline(false);
  const db = await getDB();
  await db.put('warehouses', { id: 'warehouse', organization_id: 'org', name: 'Main' });
  const vendor = await persistOfflineVendorTransaction({ organization_id: 'org', created_by: 'user', vendor_name: 'Cached Vendor',
    date_issued: '2026-09-25', items: [{ product_id: 'product', quantity: '2', unit_price: '10' }] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  } finally {
    await act(async () => root.unmount()); client.clear(); container.remove(); online.mockRestore(); onlineManager.setOnline(true);
  }
});
