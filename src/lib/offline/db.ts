/**
 * TradeTrack - IndexedDB Setup
 * Manages offline storage for all core entities
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface TradeTrackDB extends DBSchema {
  products: {
    key: string;
    value: {
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
      [key: string]: unknown;
    };
    indexes: { 'by-sku': string; 'by-barcode': string; 'by-org': string };
  };
  inventory: {
    key: string;
    value: {
      id: string;
      product_id: string;
      warehouse_id: string;
      organization_id: string;
      quantity: number;
      min_stock_level: number;
      updated_at: string;
    };
    indexes: { 'by-product': string; 'by-warehouse': string; 'by-org': string };
  };
  sales: {
    key: string;
    value: {
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
    };
    indexes: { 'by-org': string; 'by-cashier': string; 'by-synced': boolean };
  };
  sale_items: {
    key: string;
    value: {
      id: string;
      sale_id: string;
      product_id: string;
      quantity: number;
      unit_price: number;
      total: number;
      [key: string]: unknown;
    };
    indexes: { 'by-sale': string };
  };
  warehouses: {
    key: string;
    value: {
      id: string;
      organization_id: string;
      name: string;
      is_main: boolean;
      [key: string]: unknown;
    };
    indexes: { 'by-org': string };
  };
  categories: {
    key: string;
    value: {
      id: string;
      organization_id: string;
      name: string;
      [key: string]: unknown;
    };
    indexes: { 'by-org': string };
  };
  sync_queue: {
    key: string;
    value: {
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
    };
    indexes: { 'by-status': string; 'by-table': string };
  };
  pending_receipts: {
    key: string;
    value: {
      id: string;
      sale_id: string;
      data: string; // base64 encoded
      created_at: string;
      synced: boolean;
    };
    indexes: { 'by-synced': boolean };
  };
}

let dbInstance: IDBPDatabase<TradeTrackDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<TradeTrackDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<TradeTrackDB>('tradetrack-offline', 1, {
    upgrade(db) {
      // Products store
      const productsStore = db.createObjectStore('products', { keyPath: 'id' });
      productsStore.createIndex('by-sku', 'sku', { unique: false });
      productsStore.createIndex('by-barcode', 'barcode', { unique: false });
      productsStore.createIndex('by-org', 'organization_id', { unique: false });

      // Inventory store
      const inventoryStore = db.createObjectStore('inventory', { keyPath: 'id' });
      inventoryStore.createIndex('by-product', 'product_id', { unique: false });
      inventoryStore.createIndex('by-warehouse', 'warehouse_id', { unique: false });
      inventoryStore.createIndex('by-org', 'organization_id', { unique: false });

      // Sales store
      const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
      salesStore.createIndex('by-org', 'organization_id', { unique: false });
      salesStore.createIndex('by-cashier', 'cashier_id', { unique: false });
      salesStore.createIndex('by-synced', 'synced', { unique: false });

      // Sale items
      const saleItemsStore = db.createObjectStore('sale_items', { keyPath: 'id' });
      saleItemsStore.createIndex('by-sale', 'sale_id', { unique: false });

      // Warehouses
      const warehousesStore = db.createObjectStore('warehouses', { keyPath: 'id' });
      warehousesStore.createIndex('by-org', 'organization_id', { unique: false });

      // Categories
      const categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
      categoriesStore.createIndex('by-org', 'organization_id', { unique: false });

      // Sync queue
      const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
      syncStore.createIndex('by-status', 'status', { unique: false });
      syncStore.createIndex('by-table', 'table_name', { unique: false });

      // Pending receipts
      const receiptsStore = db.createObjectStore('pending_receipts', { keyPath: 'id' });
      receiptsStore.createIndex('by-synced', 'synced', { unique: false });
    },
  });

  return dbInstance;
}

// ── Utility Functions ─────────────────────────────────────────

export async function saveToOfflineDB<T extends Record<string, unknown>>(
  storeName: keyof TradeTrackDB,
  records: T[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(storeName as string, 'readwrite');
  const store = tx.objectStore(storeName as string);

  await Promise.all([
    ...records.map((record) => store.put(record)),
    tx.done,
  ]);
}

export async function getFromOfflineDB<T>(
  storeName: keyof TradeTrackDB,
  key: string
): Promise<T | undefined> {
  const db = await getDB();
  return db.get(storeName as string, key) as Promise<T | undefined>;
}

export async function getAllFromOfflineDB<T>(
  storeName: keyof TradeTrackDB
): Promise<T[]> {
  const db = await getDB();
  return db.getAll(storeName as string) as Promise<T[]>;
}

export async function deleteFromOfflineDB(
  storeName: keyof TradeTrackDB,
  key: string
): Promise<void> {
  const db = await getDB();
  await db.delete(storeName as string, key);
}

export async function clearOfflineStore(storeName: keyof TradeTrackDB): Promise<void> {
  const db = await getDB();
  await db.clear(storeName as string);
}

export async function addToSyncQueue(
  tableName: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  recordId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDB();
  await db.add('sync_queue', {
    id: crypto.randomUUID(),
    table_name: tableName,
    operation,
    record_id: recordId,
    payload,
    status: 'pending',
    retry_count: 0,
    created_at: new Date().toISOString(),
  });
}

export async function getPendingSyncItems() {
  const db = await getDB();
  return db.getAllFromIndex('sync_queue', 'by-status', 'pending');
}
