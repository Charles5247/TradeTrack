// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { getDB, type SyncQueueRecord } from '../db';

const calls = vi.hoisted(() => ({ order: [] as string[], failProduct: false }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      upsert: async () => {
        calls.order.push(table);
        return { error: table === 'products' && calls.failProduct ? new Error('Product rejected') : null };
      },
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'product' }, error: null }) }) }) }),
    }),
    storage: { from: () => ({
      upload: async () => { calls.order.push('product_images'); return { error: null }; },
      getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/photo.webp' } }),
    }) },
  }),
}));
import { syncEngine } from '../sync-engine';

beforeEach(async () => {
  calls.order.length = 0;
  calls.failProduct = false;
  const db = await getDB();
  await db.clear('sync_queue');
  await db.clear('pending_product_images');
});

async function queueSetup() {
  const db = await getDB();
  const entries = [
    ['inventory', 'stock', { id: 'stock', product_id: 'product', warehouse_id: 'warehouse' }],
    ['product_images', 'photo', { product_id: 'product' }],
    ['products', 'product', { id: 'product' }],
    ['warehouses', 'warehouse', { id: 'warehouse' }],
  ] as const;
  for (const [table_name, record_id, payload] of entries) await db.put('sync_queue', {
    id: `queue-${table_name}`, table_name, record_id, payload, operation: 'INSERT',
    status: 'pending', retry_count: 0, created_at: '2026-11-08T00:00:00Z',
  } satisfies SyncQueueRecord);
  await db.put('pending_product_images', { id: 'photo', path: 'user/photo.webp', content_type: 'image/webp', blob: new Blob(['photo'], { type: 'image/webp' }) });
  await db.put('products', { id: 'product', image_url: 'offline-image:photo' });
  return db;
}

it('uploads location and product before stock and photo, then clears the local photo', async () => {
  const db = await queueSetup();
  await (syncEngine as unknown as { pushChanges(): Promise<void> }).pushChanges();
  expect(calls.order).toEqual(['warehouses', 'products', 'inventory', 'product_images']);
  expect((await db.get('products', 'product')).image_url).toBe('https://example.com/photo.webp');
  expect(await db.get('pending_product_images', 'photo')).toBeUndefined();
});

it('keeps stock and photo pending when the product is rejected', async () => {
  const db = await queueSetup();
  calls.failProduct = true;
  await (syncEngine as unknown as { pushChanges(): Promise<void> }).pushChanges();
  expect(calls.order).toEqual(['warehouses', 'products']);
  expect((await db.get('sync_queue', 'queue-inventory')).status).toBe('pending');
  expect((await db.get('sync_queue', 'queue-product_images')).status).toBe('pending');
  expect(await db.get('pending_product_images', 'photo')).toBeDefined();
});
