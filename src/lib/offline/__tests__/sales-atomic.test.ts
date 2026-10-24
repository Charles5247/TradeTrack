// @vitest-environment jsdom
import './subscription-fixture';
import { beforeEach, expect, it, vi } from 'vitest';
import { getDB } from '../db';
import { persistOfflineSale } from '../sales';

const payload = {
  cashier_id: 'cashier', organization_id: 'org', warehouse_id: 'warehouse',
  invoice_number: 'ATOMIC', items: [{product_id:'product',warehouse_id:'warehouse',quantity:2,unit_price:10,cost_price:5,discount:0,total:20}],
  subtotal:20,discount:0,tax:0,total:20,amount_paid:20,change_amount:0,payment_method:'cash',
};
beforeEach(async()=>{
  vi.restoreAllMocks();
  const db=await getDB();
  for(const store of ['sales','sale_items','inventory','sync_queue','products'])await db.clear(store);
  await db.put('inventory',{id:'stock',organization_id:'org',product_id:'product',warehouse_id:'warehouse',quantity:10,updated_at:'2026-10-20T00:00:00Z'});
});
it('rolls back sale, items, stock and queue together if an outbox write fails',async()=>{
  const original=IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['add']>){
    if(this.name==='sync_queue')throw new DOMException('Simulated disk full','QuotaExceededError');
    return original.apply(this,args);
  });
  await expect(persistOfflineSale(payload)).rejects.toThrow('Simulated disk full');
  const db=await getDB();
  expect(await db.count('sales')).toBe(0);
  expect(await db.count('sale_items')).toBe(0);
  expect(await db.count('sync_queue')).toBe(0);
  expect((await db.get('inventory','stock')).quantity).toBe(10);
});
it('keeps both receipts and distinct causal stock snapshots across offline sales',async()=>{
  await persistOfflineSale(payload);
  await persistOfflineSale({...payload,invoice_number:'ATOMIC-2'});
  const db=await getDB();
  expect(await db.count('sales')).toBe(2);
  expect((await db.get('inventory','stock')).quantity).toBe(6);
  const queue=await db.getAll('sync_queue');
  expect(queue.filter(r=>r.table_name==='sales')).toHaveLength(2);
  const stock=queue.filter(r=>r.table_name==='inventory');
  expect(stock).toHaveLength(2);
  stock.sort((a,b)=>String(a.payload.updated_at).localeCompare(String(b.payload.updated_at)));
  expect(stock.map(row=>row.payload.quantity)).toEqual([8,6]);
});
it('cannot use ordinary offline checkout to bypass batch-managed stock',async()=>{
  const db=await getDB();
  await db.put('products',{id:'product',organization_id:'org',medical_stock_managed:true});
  await expect(persistOfflineSale(payload)).rejects.toThrow('medical batch workflow');
  expect(await db.count('sales')).toBe(0);
  expect(await db.count('sync_queue')).toBe(0);
  expect((await db.get('inventory','stock')).quantity).toBe(10);
});
