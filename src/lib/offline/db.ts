/**
 * TradeTrack - IndexedDB Setup
 * Manages offline storage for all core entities
 * VERSION 2 - includes user_sessions store for offline login
 */

import { openDB, type IDBPDatabase } from 'idb';

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

export async function getDB(): Promise<TradeTrackIDB> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB('tradetrack-offline', 2, {
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
  const record: SyncQueueRecord = {
    id: crypto.randomUUID(),
    table_name: tableName,
    operation,
    record_id: recordId,
    payload,
    status: 'pending',
    retry_count: 0,
    created_at: new Date().toISOString(),
  };
  await db.add('sync_queue', record);
}

export async function getPendingSyncItems(): Promise<SyncQueueRecord[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex('sync_queue', 'by-status', 'pending');
  return items as SyncQueueRecord[];
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
