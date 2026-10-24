// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { useAuthStore, useCartStore, useOrgStore, useNotificationStore } from './index';
import { getDB } from '@/lib/offline/db';
import type { User, Product } from '@/types';

const alice = { id: 'alice', organization_id: 'shop-a', full_name: 'Alice', role: 'business_owner', status: 'active' } as User;
const bob = { id: 'bob', organization_id: 'shop-b', full_name: 'Bob', role: 'admin', status: 'active' } as User;
const product = { id: 'rice', organization_id: 'shop-a', name: 'Rice', selling_price: 100 } as Product;

beforeEach(() => {
  useAuthStore.getState().setUser(null);
  localStorage.clear();
});

it('isolates carts and organization settings, restoring only the returning account draft', () => {
  useAuthStore.getState().setUser(alice);
  useCartStore.getState().addItem({ product, warehouse_id: 'warehouse-a', quantity: 2, unit_price: 100 });
  useOrgStore.getState().setOrganizationName('Private shop A');
  useNotificationStore.getState().setUnreadCount(4);
  useAuthStore.getState().setUser(bob);
  expect(useCartStore.getState().items).toEqual([]);
  expect(useOrgStore.getState().organizationName).toBe('TracKasuwa');
  expect(useNotificationStore.getState().unreadCount).toBe(0);
  useAuthStore.getState().setUser(alice);
  expect(useCartStore.getState().items[0].quantity).toBe(2);
  expect(useOrgStore.getState().organizationName).toBe('Private shop A');
});

it('does not adopt an unowned legacy cart or organization record', () => {
  localStorage.setItem('TracKasuwa-cart', JSON.stringify({ state: { items: [{ product, quantity: 3 }] } }));
  localStorage.setItem('TracKasuwa-org', JSON.stringify({ state: { organizationName: 'Legacy business' } }));
  useAuthStore.getState().setUser(bob);
  expect(useCartStore.getState().items).toEqual([]);
  expect(useOrgStore.getState().organizationName).toBe('TracKasuwa');
  expect(localStorage.getItem('TracKasuwa-cart')).toContain('rice');
});

it('preserves queued operations in their original offline account across logout and switching', async () => {
  useAuthStore.getState().setUser(alice);
  const db = await getDB();
  await db.put('sync_queue', { id: 'preserved-operation', status: 'pending', payload: { organization_id: 'shop-a' } });
  useAuthStore.getState().setUser(null);
  expect(useCartStore.getState().items).toEqual([]);
  useAuthStore.getState().setUser(bob);
  expect(await (await getDB()).get('sync_queue', 'preserved-operation')).toBeUndefined();
  useAuthStore.getState().setUser(alice);
  expect(await (await getDB()).get('sync_queue', 'preserved-operation')).toBeTruthy();
});

it('clears active views for a suspended account without erasing its draft', () => {
  useAuthStore.getState().setUser(alice);
  useCartStore.getState().addItem({ product, warehouse_id: 'warehouse-a', quantity: 1, unit_price: 100 });
  useAuthStore.getState().setUser({ ...alice, status: 'suspended' });
  expect(useAuthStore.getState().user).toBeNull();
  expect(useCartStore.getState().items).toEqual([]);
  useAuthStore.getState().setUser(alice);
  expect(useCartStore.getState().items).toHaveLength(1);
});
