// @vitest-environment jsdom
import '../../offline/__tests__/subscription-fixture';
import { afterEach, expect, it, vi } from 'vitest';
import { executeImport } from '../execute';
import { previewImport } from '../preview';
import { getDB } from '@/lib/offline/db';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('atomically stores products, opening stock and append-only import commands offline', async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 const rows=previewImport([{name:'Rice',sku:'OFFLINE-RICE',opening_stock:5,selling_price:100}],'products','skip',[]);
 rows[0].original={SKU:'OFFLINE-RICE',notes:'source preserved'};rows[0].fixes=[];
 const results=await executeImport({batchId:'batch-offline',kind:'products',mode:'skip',warehouseId:'warehouse',org:'org',userId:'user',role:'business_owner',rows},()=>{});
 const db=await getDB();
 expect((await db.get('products',rows[0].id)).name).toBe('Rice');
 expect((await db.getAll('inventory')).some(r=>r.product_id===rows[0].id&&r.quantity===5)).toBe(true);
 const queue=await db.getAll('sync_queue');expect(queue.filter(r=>r.table_name==='import_commands'&&r.operation==='INSERT')).toHaveLength(1);
 expect(queue.find(r=>r.table_name==='import_commands')?.payload).toMatchObject({row_data:{_import_source:{notes:'source preserved'}}});
 expect(results[0].outcome).toBe('queued');
});
it('requires connectivity for unsupported local tables and restricts staff to owners',async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 const options={batchId:'other',kind:'customers' as const,mode:'skip' as const,warehouseId:'',org:'org',userId:'user',role:'admin',rows:previewImport([{name:'Customer'}],'customers','skip',[])};
 await expect(executeImport(options,()=>{})).rejects.toThrow('connectivity');
 await expect(executeImport({...options,kind:'staff_invites'},()=>{})).rejects.toThrow('permission');
});
it('handles false-online failure without losing the import',async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
 const rows=previewImport([{name:'Vendor',email:'offline@test.local'}],'suppliers','skip',[]);
 const result=await executeImport({batchId:'false-online',kind:'suppliers',mode:'skip',warehouseId:'',org:'org',userId:'user',role:'admin',rows},()=>{});
 expect(result[0].outcome).toBe('queued');expect(await (await getDB()).get('suppliers',rows[0].id)).toHaveProperty('name','Vendor');
});
it('yields between chunks for more than a thousand rows',async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
 const request=vi.fn(async (_url, options)=>Response.json(JSON.parse(options.body).rows.map((r:any)=>({row_number:r.index,outcome:'create'}))));
 vi.stubGlobal('fetch',request);
 const rows=previewImport(Array.from({length:1001},(_,i)=>({name:`Supplier ${i}`,email:`supplier${i}@test.local`})),'suppliers','skip',[]);
 const progress=vi.fn();const result=await executeImport({batchId:'large',kind:'suppliers',mode:'skip',warehouseId:'',org:'org',userId:'user',role:'admin',rows},progress);
 expect(result).toHaveLength(1001);expect(request).toHaveBeenCalledTimes(21);expect(progress).toHaveBeenLastCalledWith(1001);
});
it('retries a timed-out historical-sales chunk online instead of sending it to the offline queue',async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
 const request=vi.fn()
  .mockRejectedValueOnce(new Error('Operation timed out'))
  .mockResolvedValueOnce(Response.json([{row_number:1,outcome:'create'}]));
 vi.stubGlobal('fetch',request);
 const rows=previewImport([{invoice_number:'OLD-1',sold_at:'2026-01-01T10:00:00+01:00',total:100,amount_paid:100,payment_method:'cash'}],'historical_sales','skip',[]);
 const result=await executeImport({batchId:'history-retry',kind:'historical_sales',mode:'skip',warehouseId:'',org:'org',userId:'user',role:'business_owner',rows},()=>{});
 expect(request).toHaveBeenCalledTimes(2);expect(result).toEqual([{row_number:1,outcome:'create'}]);
});
it('reports every unsaved online-only row after bounded retries and continues later chunks',async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
 const request=vi.fn(async (_url,options)=>{
  const body=JSON.parse(options.body);
  if(body.rows[0].index===1)return new Response('upstream unavailable',{status:503});
  return Response.json(body.rows.map((row:any)=>({row_number:row.index,outcome:'create'})));
 });
 vi.stubGlobal('fetch',request);
 const rows=previewImport(Array.from({length:51},(_,index)=>({invoice_number:`OLD-${index}`,sold_at:'2026-01-01T10:00:00+01:00',total:100,amount_paid:100,payment_method:'cash'})),'historical_sales','skip',[]);
 const result=await executeImport({batchId:'history-partial',kind:'historical_sales',mode:'skip',warehouseId:'',org:'org',userId:'user',role:'business_owner',rows},()=>{});
 expect(request).toHaveBeenCalledTimes(4);
 expect(result.filter(row=>row.outcome==='error')).toHaveLength(50);
 expect(result.at(-1)).toMatchObject({row_number:51,outcome:'create'});
});
