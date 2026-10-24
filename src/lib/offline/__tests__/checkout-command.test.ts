// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDB, type SyncQueueRecord } from '../db';
import { persistOfflineSale } from '../sales';
import { getCheckoutRecovery, postSavedCheckout } from '../checkout-command';
const client=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>client}));
import { syncEngine } from '../sync-engine';
const engine=syncEngine as unknown as {pushChanges():Promise<void>};
const payload={organization_id:'org',cashier_id:'cashier',warehouse_id:'warehouse',invoice_number:'LOCAL-1',
  items:[{product_id:'product',warehouse_id:'warehouse',quantity:1,unit_price:100,cost_price:50,discount:0,total:100}],
  subtotal:100,discount:0,tax:0,total:100,amount_paid:0,change_amount:0,payment_method:'partial'};
let quantity:number,loseResponse:boolean;
let committed:Map<string,unknown>;
beforeEach(async()=>{
 vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_ATOMIC_CHECKOUT_ENABLED','true');quantity=10;loseResponse=false;committed=new Map();
 const db=await getDB();for(const store of ['sales','sale_items','inventory','sync_queue','app_meta'])await db.clear(store);
 await db.put('app_meta',{id:'subscription:org',active:true,verifiedAt:Date.now(),lastSeen:Date.now()});
 await db.put('inventory',{id:'stock',organization_id:'org',product_id:'product',warehouse_id:'warehouse',quantity:10,updated_at:'2026-10-19T10:00:00Z'});
 client.rpc.mockImplementation(async(name:string,args:{command:{sale:{id:string};items:{quantity:number}[]}})=>{
  expect(name).toBe('post_pos_checkout');
  const id=args.command.sale.id;
  if(!committed.has(id)) {quantity-=args.command.items.reduce((sum,item)=>sum+item.quantity,0);committed.set(id,{sale_id:id,official_invoice_number:committed.size+1,stocks:[{id:'stock',quantity,updated_at:`2026-10-20T10:00:0${committed.size+1}Z`}]});}
  if(loseResponse){loseResponse=false;throw new TypeError('Acknowledgment lost');}
  return {data:committed.get(id),error:null};
 });
});
afterEach(()=>vi.unstubAllEnvs());
it('sends one atomic command per receipt and acknowledges all related outbox records',async()=>{
 await persistOfflineSale(payload);await persistOfflineSale({...payload,invoice_number:'LOCAL-2'});await engine.pushChanges();
 expect(quantity).toBe(8);expect(client.rpc).toHaveBeenCalledTimes(2);expect(client.from).not.toHaveBeenCalled();
 const db=await getDB();expect((await db.getAll('sync_queue') as SyncQueueRecord[]).every(entry=>entry.status==='synced')).toBe(true);
 expect(await getCheckoutRecovery('org')).toEqual([]);
 expect((await db.getAll('sales'))[0].payment_status).toBe('unpaid');
});
it('retries a lost acknowledgment using the same receipt identity without repeating stock',async()=>{
 const sale=await persistOfflineSale(payload);loseResponse=true;await engine.pushChanges();
 expect(quantity).toBe(9);expect(await getCheckoutRecovery('org')).toHaveLength(1);expect(client.from).not.toHaveBeenCalled();
 await postSavedCheckout(await getDB(),sale.id,'org',undefined,'Reviewed saved receipt');
 expect(quantity).toBe(9);expect(await getCheckoutRecovery('org')).toEqual([]);
 expect(client.rpc.mock.calls[0][1].command).toEqual(client.rpc.mock.calls[1][1].command);
});
it('does not acknowledge malformed responses or fall back to individual table writes',async()=>{
 await persistOfflineSale(payload);client.rpc.mockResolvedValueOnce({data:{stocks:[]},error:null});await engine.pushChanges();
 expect(await getCheckoutRecovery('org')).toHaveLength(1);expect(client.from).not.toHaveBeenCalled();
 expect((await (await getDB()).getAll('sync_queue') as SyncQueueRecord[]).some(entry=>entry.status==='synced')).toBe(false);
});
it('keeps an existing atomic receipt queued when its rollout flag is disabled',async()=>{
 await persistOfflineSale(payload);vi.stubEnv('NEXT_PUBLIC_ATOMIC_CHECKOUT_ENABLED','false');await engine.pushChanges();
 expect(client.rpc).not.toHaveBeenCalled();expect(client.from).not.toHaveBeenCalled();expect(await getCheckoutRecovery('org')).toHaveLength(1);
});
