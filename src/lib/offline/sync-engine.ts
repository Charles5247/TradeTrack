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

  private async executeSyncOperation(
    supabase: ReturnType<typeof createClient>,
    item: SyncQueueRecord
  ) {
    // Use type assertion to allow dynamic table name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    switch (item.operation) {
      case 'INSERT':
        return client.from(item.table_name).insert(item.payload);
      case 'UPDATE':
        return client
          .from(item.table_name)
          .update(item.payload)
          .eq('id', item.record_id);
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
