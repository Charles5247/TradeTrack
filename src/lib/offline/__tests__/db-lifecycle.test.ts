// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { forceCloseDatabase } from 'fake-indexeddb';
import { openDB, unwrap, type IDBPDatabase } from 'idb';

const account = vi.hoisted(() => ({ namespace: '' }));
vi.mock('../auth-cache', () => ({ getOfflineAccountNamespace: () => account.namespace }));
import { getDB, getPendingSyncItems } from '../db';
import { readVerification } from '@/lib/subscriptions/verification';

// fake-indexeddb declares a constructor parameter, but accepts an instance.
const terminateDatabase = forceCloseDatabase as unknown as (db: IDBDatabase) => void;
const connections: IDBPDatabase[] = [];
beforeEach(() => { account.namespace = `lifecycle-${crypto.randomUUID()}`; });
afterEach(() => { for (const db of connections.splice(0)) db.close(); vi.restoreAllMocks(); });
const trackedDB = async () => { const db = await getDB(); connections.push(db); return db; };

it('shares one connection when initial callers arrive together', async () => {
  const open = vi.spyOn(indexedDB, 'open');
  const handles = await Promise.all(Array.from({ length: 8 }, trackedDB));
  expect(new Set(handles).size).toBe(1);
  expect(open).toHaveBeenCalledTimes(1);
});

it('reopens a closed connection without losing verification or pending sales', async () => {
  const db = await trackedDB();
  const now = Date.now();
  await db.put('app_meta', { id: 'subscription:org', active: true, verifiedAt: now, lastSeen: now });
  await db.put('sync_queue', { id: 'pending-sale', status: 'pending', table_name: 'sales', record_id: 'sale-1', operation: 'INSERT' });
  db.close();
  const [verification, pending, reopened] = await Promise.all([readVerification('org'), getPendingSyncItems(), trackedDB()]);
  expect(reopened).not.toBe(db);
  expect(verification).toMatchObject({ active: true, verifiedAt: now });
  expect(pending.map(item => item.id)).toEqual(['pending-sale']);
});

it('recovers after the browser forcibly terminates the connection', async () => {
  const db = await trackedDB();
  await db.put('products', { id: 'product-1', name: 'Saved offline' });
  const closed = new Promise(resolve => db.addEventListener('close', resolve, { once: true }));
  terminateDatabase(unwrap(db));
  await closed;
  const reopened = await trackedDB();
  expect(reopened).not.toBe(db);
  expect(await reopened.get('products', 'product-1')).toMatchObject({ name: 'Saved offline' });
});

it('releases a connection when another tab needs a schema upgrade', async () => {
  const db = await trackedDB();
  await db.put('sales', { id: 'sale-1', total: 200 });
  const upgraded = await openDB(db.name, 7);
  connections.push(upgraded);
  expect(await upgraded.get('sales', 'sale-1')).toMatchObject({ total: 200 });
});

it('keeps a delayed account open from replacing another account connection', async () => {
  const nameA = account.namespace;
  const old = await openDB(`TracKasuwa-offline-${nameA}`, 5);
  connections.push(old);
  const openingA = trackedDB();
  account.namespace = `${nameA}-other`;
  const dbB = await trackedDB();
  old.close();
  const dbA = await openingA;
  expect(dbA.name).toBe(`TracKasuwa-offline-${nameA}`);
  expect(await trackedDB()).toBe(dbB);
  const closed = new Promise(resolve => dbA.addEventListener('close', resolve, { once: true }));
  terminateDatabase(unwrap(dbA));
  await closed;
  expect(await trackedDB()).toBe(dbB);
});

it('propagates an open failure and permits a later successful open', async () => {
  vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => { throw new DOMException('Storage unavailable', 'SecurityError'); });
  await expect(getDB()).rejects.toMatchObject({ name: 'SecurityError' });
  expect((await trackedDB()).name).toContain(account.namespace);
});
