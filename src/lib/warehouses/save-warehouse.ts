import { getOfflineAccountNamespace } from '@/lib/offline/auth-cache';
import { addToSyncQueue, getDB, type SyncQueueRecord } from '@/lib/offline/db';
import { createClient } from '@/lib/supabase/client';
import { isOffline } from '@/lib/utils/network';
import { withTimeout } from '@/lib/utils/timeout';
import type { Warehouse } from '@/types';

type WarehouseFields = { name: string; description: string; address: string; is_main: boolean };
type WarehouseInsert = WarehouseFields & { id: string; organization_id: string; updated_at?: string };
const locationTimeout = 'Network request failed: location confirmation timed out.';

export class WarehouseCreateRejected extends Error {}

function matchesWarehouse(
  current: { name: unknown; description?: unknown; address?: unknown; is_main: unknown },
  requested: WarehouseFields,
) {
  return current.name === requested.name
    && (current.description ?? '') === requested.description
    && (current.address ?? '') === requested.address
    && current.is_main === requested.is_main;
}

/** A create can have committed before its connection failed. Verify exact
 * replay under the caller's RLS context without updating the original row. */
async function insertWarehouse(client: ReturnType<typeof createClient>, payload: WarehouseInsert) {
  const { error } = await withTimeout(Promise.resolve(client.from('warehouses').insert(payload)), 5000, locationTimeout);
  if (!error) return;
  if (error.code !== '23505') {
    if (/^(22|23|42)[0-9A-Z]{3}$/.test(error.code) || error.code === 'P0001') {
      throw new WarehouseCreateRejected(error.message);
    }
    throw new Error(error.message);
  }

  const { data, error: lookupError } = await withTimeout(Promise.resolve(client
    .from('warehouses').select('name,description,address,is_main')
    .eq('id', payload.id).eq('organization_id', payload.organization_id).maybeSingle()), 5000, locationTimeout);
  if (lookupError) throw new Error(lookupError.message);
  if (!data || !matchesWarehouse(data, payload)) {
    throw new Error('This location could not be confirmed. Refresh your locations before trying again.');
  }
}

export async function syncWarehouseInsert(
  client: ReturnType<typeof createClient>,
  item: SyncQueueRecord,
) {
  const { id, organization_id, name, description, address, is_main, updated_at } = item.payload;
  if (typeof id !== 'string' || id !== item.record_id || typeof organization_id !== 'string'
    || typeof name !== 'string' || !name.trim() || typeof is_main !== 'boolean'
    || (description != null && typeof description !== 'string')
    || (address != null && typeof address !== 'string')) {
    throw new Error('This saved location is incomplete. Review it before syncing.');
  }
  await insertWarehouse(client, {
    id, organization_id, name, description: description ?? '', address: address ?? '', is_main,
    ...(typeof updated_at === 'string' ? { updated_at } : {}),
  });
}

interface WarehouseSave {
  organizationId: string;
  id: string;
  data: WarehouseFields;
  existing?: Warehouse;
}

export async function saveWarehouse({ organizationId, id, data, existing }: WarehouseSave): Promise<'confirmed' | 'pending'> {
  if (!organizationId) throw new Error('No business is selected.');
  if (existing && (existing.id !== id || existing.organization_id !== organizationId)) {
    throw new Error('Choose a location in your business.');
  }
  const fields = { ...data, name: data.name.trim() };
  if (!fields.name) throw new Error('Enter a location name.');
  const payload = { ...fields, id, organization_id: organizationId };
  const namespace = getOfflineAccountNamespace();

  async function saveOffline() {
    if (getOfflineAccountNamespace() !== namespace) {
      throw new Error('This account changed. Reopen the location form.');
    }
    const db = await getDB();
    if (getOfflineAccountNamespace() !== namespace) {
      throw new Error('This account changed. Reopen the location form.');
    }
    const tx = db.transaction(['warehouses', 'sync_queue'], 'readwrite');
    try {
      if (!existing) {
        const attempts: SyncQueueRecord[] = await tx.objectStore('sync_queue')
          .index('by-queue-key').getAll(['warehouses', id, 'INSERT']);
        if (attempts.some(attempt => attempt.payload.organization_id !== organizationId
          || !matchesWarehouse({
            name: attempt.payload.name,
            description: attempt.payload.description,
            address: attempt.payload.address,
            is_main: attempt.payload.is_main,
          }, fields))) {
          throw new Error('This location was already submitted with different details. Refresh your locations.');
        }
        if (attempts.some(attempt => attempt.status === 'pending' || attempt.status === 'syncing')) {
          await tx.done;
          return;
        }
      }
      const row = {
        ...payload,
        ...(existing ? { created_at: existing.created_at } : {}),
        updated_at: new Date().toISOString(),
      };
      await tx.objectStore('warehouses').put({ ...row, inventory: [] });
      await addToSyncQueue('warehouses', existing ? 'UPDATE' : 'INSERT', id, row, tx);
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may have finished. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  }

  if (!isOffline()) {
    const client = createClient();
    try {
      if (existing) {
        const { error } = await withTimeout(Promise.resolve(client.from('warehouses')
          .update(fields).eq('id', id).eq('organization_id', organizationId)), 5000);
        if (error) throw new Error(error.message);
      } else {
        await insertWarehouse(client, payload);
      }
      return 'confirmed';
    } catch (error) {
      if (error instanceof WarehouseCreateRejected
        || (!(error instanceof TypeError) && !(error instanceof Error && /timed out|fetch failed|failed to fetch/i.test(error.message)))) {
        throw error;
      }
    }
  }
  await saveOffline();
  return 'pending';
}
