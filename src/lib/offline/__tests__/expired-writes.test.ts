// @vitest-environment jsdom
import { expect,it } from 'vitest';
import { getDB } from '../db';
import { persistOfflineSale } from '../sales';
import { persistOfflinePurchaseOrder } from '../purchase-orders';
import { persistOfflineVendorTransaction } from '../vendor-transactions';
it('blocks expired offline writes before changing stock or creating queued work, while retaining readable records',async()=>{
 const db=await getDB();const now=Date.now();
 await db.put('app_meta',{id:'subscription:expired-org',active:false,verifiedAt:now,lastSeen:now});
 await db.put('inventory',{id:'expired-stock',organization_id:'expired-org',product_id:'p',warehouse_id:'w',quantity:7});
 const queueBefore=await db.count('sync_queue');
 await expect(persistOfflineSale({organization_id:'expired-org'} as any)).rejects.toThrow('inactive');
 await expect(persistOfflinePurchaseOrder({organization_id:'expired-org'} as any)).rejects.toThrow('inactive');
 await expect(persistOfflineVendorTransaction({organization_id:'expired-org'} as any)).rejects.toThrow('inactive');
 expect((await db.get('inventory','expired-stock')).quantity).toBe(7);
 expect(await db.count('sync_queue')).toBe(queueBefore);
});
