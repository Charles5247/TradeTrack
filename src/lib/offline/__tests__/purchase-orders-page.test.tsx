// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { getDB } from '../db';
import { persistOfflinePurchaseOrder } from '../purchase-orders';

vi.mock('@/store', () => ({ useAuthStore: () => ({ user: { id: 'user-1', organization_id: 'org-1', role: 'business_owner' } }) }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: new Proxy({}, {
  get: () => new Proxy({}, { get: (_target, key) => String(key) }),
}) }) }));
vi.mock('@/components/shared/access-guard', () => ({ AccessGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../sync-engine', () => ({ syncEngine: { subscribe: () => () => {}, sync: vi.fn(), pullPurchaseOrders: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => { throw new TypeError('Failed to fetch'); } }) }));
import PurchaseOrdersPage from '@/app/(dashboard)/purchase-orders/page';

it('renders cached orders offline, keeps lifecycle disabled until synced, and survives false-online failures', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  onlineManager.setOnline(false);
  const db = await getDB();
  await db.put('suppliers', { id: 'supplier-1', organization_id: 'org-1', name: 'Cached Supplier' });
  await db.put('products', { id: 'product-1', organization_id: 'org-1', status: 'active', name: 'Cached Product' });
  const order = await persistOfflinePurchaseOrder({
    organization_id: 'org-1', supplier_id: 'supplier-1', created_by: 'user-1',
    expected_date: null, notes: '', items: [{ product_id: 'product-1', quantity: '2', unit_cost: '10' }],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 100 && !predicate(); i++) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    expect(predicate()).toBe(true);
  };
  const sendButton = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'send');
  try {
    await act(async () => { root.render(<QueryClientProvider client={queryClient}><PurchaseOrdersPage /></QueryClientProvider>); });
    await waitFor(() => container.textContent?.includes('Cached Supplier') === true);
    expect(container.textContent).toContain('Reconnect to send, cancel or receive.');
    expect(sendButton()?.disabled).toBe(true);
    online.mockReturnValue(true);
    await act(async () => { onlineManager.setOnline(true); window.dispatchEvent(new Event('online')); });
    await waitFor(() => container.textContent?.includes('Waiting for this order and all items to sync.') === true);
    expect(sendButton()?.disabled).toBe(true);
    await db.put('purchase_orders', { ...order, synced: true });
    for (const item of await db.getAll('purchase_order_items')) await db.put('purchase_order_items', { ...item, synced: true });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); });
    await waitFor(() => sendButton()?.disabled === false);
    expect(container.textContent).toContain('Cached Supplier');
  } finally {
    await act(async () => root.unmount());
    queryClient.clear(); container.remove(); online.mockRestore(); onlineManager.setOnline(true);
  }
});
