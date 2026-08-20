/**
 * TradeTrack - IndexedDB Setup
 * Manages offline storage for all core entities
 * VERSION 2 - includes user_sessions store for offline login
 */

import { openDB, type IDBPDatabase } from 'idb';
import { generateId } from '@/lib/utils/id';
import { getOfflineAccountNamespace } from './auth-cache';

// Use a plain interface without the DBSchema constraint to avoid index signature conflicts
interface ProductRecord {
  id: string;
  organization_id: string;
  name: string;
  sku: string;
  barcode?: string;
  selling_price: number;
  cost_price: number;
  status: string;
  category_id?: string;
  image_url?: string;
  updated_at: string;
}

interface InventoryRecord {
  id: string;
  product_id: string;
  warehouse_id: string;
  organization_id: string;
  quantity: number;
  min_stock_level: number;
  updated_at: string;
}

interface SaleRecord {
  id: string;
  organization_id: string;
  invoice_number: string;
  cashier_id: string;
  warehouse_id: string;
  total: number;
  status: string;
  created_at: string;
  synced: boolean;
  [key: string]: unknown;
}

interface SaleItemRecord {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  [key: string]: unknown;
}

interface WarehouseRecord {
  id: string;
  organization_id: string;
  name: string;
  is_main: boolean;
  [key: string]: unknown;
}

interface CategoryRecord {
  id: string;
  organization_id: string;
  name: string;
  [key: string]: unknown;
}

interface SyncQueueRecord {
  id: string;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retry_count: number;
  error?: string;
  created_at: string;
  synced_at?: string;
  /**
   * The client's local `updated_at` timestamp for this record AT THE TIME
   * the change was queued (not when it's eventually synced). Used by the
   * sync engine's conflict-resolution rule for UPDATE operations: the
   * server row is only overwritten if this is NEWER than the server's own
   * `updated_at` — otherwise the local change is considered stale and is
   * dropped in favor of the server's (newer) version, rather than blindly
   * overwriting concurrent server-side changes.
   * Not applicable to INSERT (no prior row to conflict with) or to
   * `sales`/`sale_items` (append-only/immutable — see sync-engine.ts).
   */
  client_updated_at?: string;
}

interface PendingReceiptRecord {
  id: string;
  sale_id: string;
  data: string; // base64 encoded
  created_at: string;
  synced: boolean;
}

interface UserSessionRecord {
  id: string;
  profile: Record<string, unknown>;
  cached_at: string;
}

// Store name type
type StoreNames =
  | 'products'
  | 'inventory'
  | 'sales'
  | 'sale_items'
  | 'warehouses'
  | 'categories'
  | 'sync_queue'
  | 'pending_receipts'
  | 'user_sessions';

// Use any for the generic DB to avoid complex type gymnastics with idb
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TradeTrackIDB = IDBPDatabase<any>;

let dbInstance: TradeTrackIDB | null = null;
let activeDbName: string | null = null;

function getOfflineDatabaseName(): string {
  const namespace = getOfflineAccountNamespace();
  return `tradetrack-offline-${namespace}`;
}

export async function getDB(): Promise<TradeTrackIDB> {
  const dbName = getOfflineDatabaseName();
  if (dbInstance && activeDbName === dbName) return dbInstance;

  dbInstance = null;
  activeDbName = null;

  dbInstance = await openDB(dbName, 2, {
    upgrade(db, oldVersion) {
      // -- v1 stores --
      if (!db.objectStoreNames.contains('products')) {
        const productsStore = db.createObjectStore('products', { keyPath: 'id' });
        productsStore.createIndex('by-sku', 'sku', { unique: false });
        productsStore.createIndex('by-barcode', 'barcode', { unique: false });
        productsStore.createIndex('by-org', 'organization_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('inventory')) {
        const inventoryStore = db.createObjectStore('inventory', { keyPath: 'id' });
        inventoryStore.createIndex('by-product', 'product_id', { unique: false });
        inventoryStore.createIndex('by-warehouse', 'warehouse_id', { unique: false });
        inventoryStore.createIndex('by-org', 'organization_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('sales')) {
        const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
        salesStore.createIndex('by-org', 'organization_id', { unique: false });
        salesStore.createIndex('by-cashier', 'cashier_id', { unique: false });
        salesStore.createIndex('by-synced', 'synced', { unique: false });
      }
      if (!db.objectStoreNames.contains('sale_items')) {
        const saleItemsStore = db.createObjectStore('sale_items', { keyPath: 'id' });
        saleItemsStore.createIndex('by-sale', 'sale_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('warehouses')) {
        const warehousesStore = db.createObjectStore('warehouses', { keyPath: 'id' });
        warehousesStore.createIndex('by-org', 'organization_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('categories')) {
        const categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
        categoriesStore.createIndex('by-org', 'organization_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('by-status', 'status', { unique: false });
        syncStore.createIndex('by-table', 'table_name', { unique: false });
      }
      if (!db.objectStoreNames.contains('pending_receipts')) {
        const receiptsStore = db.createObjectStore('pending_receipts', { keyPath: 'id' });
        receiptsStore.createIndex('by-synced', 'synced', { unique: false });
      }

      // -- v2 stores --
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('user_sessions')) {
          const sessionsStore = db.createObjectStore('user_sessions', { keyPath: 'id' });
          sessionsStore.createIndex('by-email', 'profile.email', { unique: false });
        }
      }
    },
  });

  activeDbName = dbName;
  return dbInstance;
}

// ── User Session Cache ────────────────────────────────────────

export async function cacheUserSession(
  userId: string,
  profile: Record<string, unknown>
): Promise<void> {
  try {
    const db = await getDB();
    const record: UserSessionRecord = {
      id: userId,
      profile,
      cached_at: new Date().toISOString(),
    };
    await db.put('user_sessions', record);
  } catch (err) {
    console.warn('[offline] Failed to cache user session:', err);
  }
}

export async function getCachedUserSession(userId: string): Promise<UserSessionRecord | null> {
  try {
    const db = await getDB();
    const entry = await db.get('user_sessions', userId);
    return (entry as UserSessionRecord) ?? null;
  } catch {
    return null;
  }
}

export async function getAnyCachedSession(): Promise<UserSessionRecord | null> {
  try {
    const db = await getDB();
    const all = await db.getAll('user_sessions');
    return (all[0] as UserSessionRecord) ?? null;
  } catch {
    return null;
  }
}

export async function clearCachedSession(userId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('user_sessions', userId);
  } catch {
    // Ignore
  }
}

// ── Generic Utility Functions ─────────────────────────────────

export async function saveToOfflineDB<T>(
  storeName: StoreNames,
  records: T[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  await Promise.all([
    ...records.map((record) => store.put(record)),
    tx.done,
  ]);
}

export async function getFromOfflineDB<T>(
  storeName: StoreNames,
  key: string
): Promise<T | undefined> {
  const db = await getDB();
  return db.get(storeName, key) as Promise<T | undefined>;
}

export async function getAllFromOfflineDB<T>(
  storeName: StoreNames
): Promise<T[]> {
  const db = await getDB();
  return db.getAll(storeName) as Promise<T[]>;
}

export async function deleteFromOfflineDB(
  storeName: StoreNames,
  key: string
): Promise<void> {
  const db = await getDB();
  await db.delete(storeName, key);
}

export async function clearOfflineStore(storeName: StoreNames): Promise<void> {
  const db = await getDB();
  await db.clear(storeName);
}

export async function addToSyncQueue(
  tableName: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  recordId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDB();
  // Only rows that could possibly still be "in flight" are relevant to the
  // duplicate check below. Using the `by-status` index to fetch just the
  // 'pending' and 'syncing' rows (instead of db.getAll, which reads and
  // JS-scans EVERY row ever written to this table — including years of
  // already-'synced' history) keeps this call's cost proportional to the
  // current backlog, not to the store's all-time size.
  const [pendingItems, syncingItems] = await Promise.all([
    db.getAllFromIndex('sync_queue', 'by-status', 'pending'),
    db.getAllFromIndex('sync_queue', 'by-status', 'syncing'),
  ]);
  const alreadyQueued = [...pendingItems, ...syncingItems].some((item) => {
    const record = item as SyncQueueRecord;
    return (
      record.table_name === tableName &&
      record.record_id === recordId &&
      record.operation === operation
    );
  });

  if (alreadyQueued) return;

  // Capture the record's own `updated_at` (if present in the payload) as
  // the client-side timestamp used for the sync engine's last-write-wins
  // conflict check on UPDATE operations. Falls back to "now" if the
  // payload doesn't carry one (e.g. a partial-field update).
  const clientUpdatedAt =
    (typeof payload.updated_at === 'string' && payload.updated_at) ||
    new Date().toISOString();

  const record: SyncQueueRecord = {
    id: generateId(),
    table_name: tableName,
    operation,
    record_id: recordId,
    payload,
    status: 'pending',
    retry_count: 0,
    created_at: new Date().toISOString(),
    client_updated_at: clientUpdatedAt,
  };
  await db.add('sync_queue', record);
}

export async function getPendingSyncItems(): Promise<SyncQueueRecord[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex('sync_queue', 'by-status', 'pending');
  return items as SyncQueueRecord[];
}

/**
 * Deletes `sync_queue` rows that have already synced successfully and are
 * older than `olderThanDays`. Without this, the table only ever grows —
 * every `addToSyncQueue` call (and, before the `by-status` index fix above,
 * every duplicate check) pays the cost of that unbounded history forever.
 * Uses the `by-status` index to fetch only 'synced' rows (never touches
 * 'pending'/'syncing'/'failed' rows at all) and deletes the stale ones in a
 * single readwrite transaction.
 */
export async function pruneSyncedQueueItems(olderThanDays = 3): Promise<number> {
  const db = await getDB();
  const syncedItems = (await db.getAllFromIndex(
    'sync_queue',
    'by-status',
    'synced'
  )) as SyncQueueRecord[];

  if (syncedItems.length === 0) return 0;

  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const staleIds = syncedItems
    .filter((item) => {
      const timestamp = item.synced_at ?? item.created_at;
      const time = timestamp ? new Date(timestamp).getTime() : 0;
      return time <= cutoff;
    })
    .map((item) => item.id);

  if (staleIds.length === 0) return 0;

  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');
  await Promise.all([...staleIds.map((id) => store.delete(id)), tx.done]);

  return staleIds.length;
}

// Export types for use in other modules
export type {
  ProductRecord,
  InventoryRecord,
  SaleRecord,
  SaleItemRecord,
  WarehouseRecord,
  CategoryRecord,
  SyncQueueRecord,
  PendingReceiptRecord,
  UserSessionRecord,
  StoreNames,
};
