// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDB, type SyncQueueRecord } from '../db';
import { recordInventoryAdjustment, postSavedAdjustment } from '../inventory-adjustment';
const client=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>client}));
const payload={organization_id:'org',user_id:'user',product_id:'product',warehouse_id:'warehouse',inventory_id:'stock',
 current_quantity:20,quantity_change:-3,movement_type:'out' as const,reason:'Damaged stock'};
beforeEach(async()=>{
 vi.clearAllMocks();vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
 const db=await getDB();await db.clear('inventory');await db.clear('sync_queue');
 await db.put('inventory',{id:'stock',organization_id:'org',product_id:'product',warehouse_id:'warehouse',quantity:20,updated_at:'original'});
 client.rpc.mockResolvedValue({data:{id:'stock',organization_id:'org',product_id:'product',warehouse_id:'warehouse',quantity:17,updated_at:'confirmed'},error:null});
});
afterEach(()=>vi.restoreAllMocks());
it('atomically records an offline adjustment and one replayable command without client ledger or audit claims',async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 expect(await recordInventoryAdjustment(payload)).toEqual({offline:true,quantity:17});
 const db=await getDB(),queue=await db.getAll('sync_queue');
 expect((await db.get('inventory','stock')).quantity).toBe(17);
 expect(queue).toHaveLength(1);expect(queue[0]).toMatchObject({table_name:'inventory_adjustment_commands',payload:{quantity_change:-3,reason:'Damaged stock'}});
 expect(client.rpc).not.toHaveBeenCalled();expect(client.from).not.toHaveBeenCalled();
});
it('acknowledges a single online delta command and uses the returned authoritative stock',async()=>{
 expect(await recordInventoryAdjustment(payload)).toEqual({offline:false,quantity:17});
 const db=await getDB();expect((await db.getAll('sync_queue'))[0].status).toBe('synced');
 expect((await db.get('inventory','stock')).updated_at).toBe('confirmed');
 expect(client.rpc).toHaveBeenCalledWith('apply_inventory_adjustment',expect.objectContaining({command:expect.objectContaining({quantity_change:-3})}));
 expect(client.from).not.toHaveBeenCalled();
});
it('preserves an uncertain server response and retries the identical adjustment command',async()=>{
 client.rpc.mockRejectedValueOnce(new TypeError('Connection lost after commit'));
 expect(await recordInventoryAdjustment(payload)).toEqual({offline:true,quantity:17});
 const db=await getDB(),entry=(await db.getAll('sync_queue'))[0] as SyncQueueRecord;
 expect(entry.status).toBe('failed');await postSavedAdjustment(db,entry);
 expect(client.rpc.mock.calls[0][1]).toEqual(client.rpc.mock.calls[1][1]);
 expect((await db.get('sync_queue',entry.id)).status).toBe('synced');
});
it.each([-21,0,0.5])('rejects invalid or unavailable adjustment quantities without partial local effects: %s',async quantity_change=>{
 await expect(recordInventoryAdjustment({...payload,quantity_change})).rejects.toThrow();
 const db=await getDB();expect((await db.get('inventory','stock')).quantity).toBe(20);expect(await db.count('sync_queue')).toBe(0);
});
it('retains a rejected command for explicit review and rejects malformed confirmations',async()=>{
 client.rpc.mockResolvedValueOnce({data:null,error:{message:'Permission denied'}});
 await expect(recordInventoryAdjustment(payload)).rejects.toThrow('Permission denied');
 const db=await getDB(),entry=(await db.getAll('sync_queue'))[0] as SyncQueueRecord;
 expect(entry.status).toBe('failed');client.rpc.mockResolvedValueOnce({data:{quantity:17},error:null});
 await expect(postSavedAdjustment(db,entry)).rejects.toThrow('confirmation');
 expect((await db.get('sync_queue',entry.id)).status).toBe('failed');
});
