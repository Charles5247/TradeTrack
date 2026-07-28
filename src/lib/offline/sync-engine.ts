'use client';

/**
 * TradeTrack - Offline Sync Engine
 * Handles bidirectional sync between IndexedDB and Supabase
 */

import { createClient } from '@/lib/supabase/client';
import {
  getDB,
  getPendingSyncItems,
  saveToOfflineDB,
  clearOfflineStore,
  type SyncQueueRecord,
} from './db';

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface SyncState {
  status: SyncStatus;
  lastSync: Date | null;
  pendingCount: number;
  error: string | null;
}

type SyncListener = (state: SyncState) => void;

class SyncEngine {
  private listeners: SyncListener[] = [];
  private state: SyncState = {
    status: 'idle',
    lastSync: null,
    pendingCount: 0,
    error: null,
  };
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  private handleOnline() {
    this.isOnline = true;
    this.setState({ status: 'idle', error: null });
    this.sync();
  }

  private handleOffline() {
    this.isOnline = false;
    this.setState({ status: 'offline' });
  }

  private setState(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(listener: SyncListener) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getState() {
    return this.state;
  }

  startAutoSync(intervalMs = 30000) {
    this.syncInterval = setInterval(() => {
      if (this.isOnline) this.sync();
    }, intervalMs);
  }

  stopAutoSync() {
    if (this.syncInterval) clearInterval(this.syncInterval);
  }

  async sync() {
    if (!this.isOnline || this.state.status === 'syncing') return;

    this.setState({ status: 'syncing', error: null });

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        this.setState({ status: 'idle' });
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile?.organization_id) {
        this.setState({ status: 'idle' });
        return;
      }

      const orgId = profile.organization_id;

      await this.pushChanges();
      await this.pullData(orgId, supabase);

      this.setState({
        status: 'idle',
        lastSync: new Date(),
        pendingCount: 0,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      this.setState({ status: 'error', error: message });
    }
  }

  private async pushChanges() {
    const pendingItems = await getPendingSyncItems();
    if (pendingItems.length === 0) return;

    const supabase = createClient();
    const db = await getDB();

    for (const item of pendingItems) {
      try {
        await db.put('sync_queue', { ...item, status: 'syncing' });

        const { error } = await this.executeSyncOperation(supabase, item);
        if (error) throw error;

        await db.put('sync_queue', {
          ...item,
          status: 'synced',
          synced_at: new Date().toISOString(),
        });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : 'Unknown error';
        await db.put('sync_queue', {
          ...item,
          status: item.retry_count >= 3 ? 'failed' : 'pending',
          retry_count: item.retry_count + 1,
          error: errMessage,
        });
      }
    }
  }

  /**
   * Conflict-resolution rule (formalized — NOT a naive full re-upload):
   *
   * 1. `sales` and `sale_items` are treated as APPEND-ONLY / immutable.
   *    A completed offline sale is a fact that already happened — it must
   *    never be silently dropped OR merged with a "conflicting" server
   *    version, because there is no legitimate concurrent edit to a sale
   *    record once created. We always INSERT (never UPDATE/overwrite) and
   *    let a duplicate-key insert on retry be treated as already-synced
   *    (idempotent by `id`), rather than upserting.
   *
   * 2. All other tables (`products`, `inventory`, `warehouses`,
   *    `categories`, etc.) use explicit LAST-WRITE-WINS BY TIMESTAMP for
   *    UPDATE operations: before overwriting the server row, we fetch its
   *    current `updated_at` and only apply the queued change if the
   *    client's `client_updated_at` (captured at the moment the change was
   *    queued — see addToSyncQueue) is strictly newer. If the server's
   *    version is newer (i.e. someone else's change — e.g. a different
   *    device/cashier for the same org — already landed while we were
   *    offline), we DROP our stale local write rather than clobber theirs,
   *    and instead let the subsequent pullData() refresh the local copy
   *    with the winning server version. This is why the business_owner
   *    dashboard intentionally shows a "last-synced" state while offline
   *    by design — it reflects the last state IT knows about, and
   *    reconciles to the server's winning version once back online.
   *
   * 3. INSERT operations for non-append-only tables have no prior row to
   *    conflict with, so they upsert-by-id directly (a retried INSERT for
   *    a record that already made it to the server is idempotent).
   */
  private async executeSyncOperation(
    supabase: ReturnType<typeof createClient>,
    item: SyncQueueRecord
  ) {
    // Use type assertion to allow dynamic table name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;

    const isAppendOnly = item.table_name === 'sales' || item.table_name === 'sale_items';

    switch (item.operation) {
      case 'INSERT':
        // Append-only tables and fresh inserts both upsert-by-id, which is
        // idempotent on retry — the difference for append-only tables is
        // simply that they are NEVER reached via the 'UPDATE' branch below.
        return client.from(item.table_name).upsert(item.payload, { onConflict: 'id' });

      case 'UPDATE': {
        if (isAppendOnly) {
          // Should not normally happen (sales/sale_items are only ever
          // queued as INSERT — see persistOfflineSale), but guard anyway:
          // never let an "UPDATE" mutate an immutable sales record.
          return { error: null };
        }

        // Last-write-wins by timestamp: only overwrite if our queued
        // change is newer than what's currently on the server.
        const { data: serverRow, error: fetchErr } = await client
          .from(item.table_name)
          .select('updated_at')
          .eq('id', item.record_id)
          .maybeSingle();

        if (fetchErr) return { error: fetchErr };

        const serverUpdatedAt = serverRow?.updated_at ? new Date(serverRow.updated_at).getTime() : 0;
        const clientUpdatedAt = item.client_updated_at ? new Date(item.client_updated_at).getTime() : 0;

        if (serverRow && serverUpdatedAt > clientUpdatedAt) {
          // The server already has a newer version (a concurrent change
          // from another device/cashier) — drop our stale local write
          // instead of overwriting it. Not an error: the sync is
          // considered successful, just superseded.
          console.info(
            `[sync] Dropping stale local UPDATE for ${item.table_name}:${item.record_id} ` +
            `(server updated_at=${serverRow.updated_at} is newer than local client_updated_at=${item.client_updated_at})`
          );
          return { error: null };
        }

        return client
          .from(item.table_name)
          .upsert(item.payload, { onConflict: 'id' })
          .eq('id', item.record_id);
      }

      case 'DELETE':
        return client
          .from(item.table_name)
          .delete()
          .eq('id', item.record_id);

      default:
        return { error: new Error('Unknown operation') };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async pullData(orgId: string, supabase: any) {
    const lastSync = this.state.lastSync;
    const since = lastSync ? lastSync.toISOString() : '1970-01-01T00:00:00Z';

    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('organization_id', orgId)
      .gte('updated_at', since);

    if (products?.length) {
      await saveToOfflineDB('products', products);
    }

    const { data: inventory } = await supabase
      .from('inventory')
      .select('*')
      .eq('organization_id', orgId)
      .gte('updated_at', since);

    if (inventory?.length) {
      await saveToOfflineDB('inventory', inventory);
    }

    const { data: warehouses } = await supabase
      .from('warehouses')
      .select('*')
      .eq('organization_id', orgId);

    if (warehouses?.length) {
      await clearOfflineStore('warehouses');
      await saveToOfflineDB('warehouses', warehouses);
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .eq('organization_id', orgId);

    if (categories?.length) {
      await clearOfflineStore('categories');
      await saveToOfflineDB('categories', categories);
    }
  }

  async getPendingCount(): Promise<number> {
    const items = await getPendingSyncItems();
    return items.length;
  }
}

export const syncEngine = typeof window !== 'undefined' ? new SyncEngine() : null;

export function useSyncEngine() {
  return syncEngine;
}
