'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AccessGuard } from '@/components/shared/access-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { formatDateTime } from '@/lib/utils/format';
import type { Database } from '@/lib/supabase/types';

type Memo = Database['public']['Tables']['warehouse_memos']['Row'];
type Item = { product_id: string; quantity: number };
type Movement = Database['public']['Tables']['inventory_movements']['Row'];

export default function WarehouseMemosPage() {
  return <AccessGuard allow={['business_owner','admin','cashier']}><MemoWorkspace /></AccessGuard>;
}

function MemoWorkspace() {
  const user = useAuthStore(state => state.user);
  const owner = user?.role === 'business_owner';
  const cache = useQueryClient();
  const [warehouseId, setWarehouseId] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [reference, setReference] = useState('');
  const [items, setItems] = useState<Item[]>([{ product_id: '', quantity: 1 }]);
  const [activeMemo, setActiveMemo] = useState<Memo | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [historyProduct, setHistoryProduct] = useState('all');
  const [historyWarehouse, setHistoryWarehouse] = useState('all');
  const [historyPage, setHistoryPage] = useState(0);

  const catalog = useQuery({
    queryKey: ['memo-catalog', user?.organization_id], enabled: Boolean(user?.organization_id),
    queryFn: async () => {
      const db = createClient();
      const [products, warehouses, staff] = await Promise.all([
        db.from('products').select('id,name,sku').eq('organization_id', user!.organization_id!).eq('status','active').order('name'),
        db.from('warehouses').select('id,name').eq('organization_id', user!.organization_id!).order('name'),
        db.from('users').select('id,full_name').eq('organization_id', user!.organization_id!),
      ]);
      if (products.error) throw products.error;
      if (warehouses.error) throw warehouses.error;
      if (staff.error) throw staff.error;
      return { products: products.data || [], warehouses: warehouses.data || [], staff: staff.data || [] };
    },
  });
  const memos = useQuery({
    queryKey: ['warehouse-memos', user?.organization_id], enabled: Boolean(user?.organization_id),
    queryFn: async () => {
      const result = await createClient().from('warehouse_memos').select('*').eq('organization_id', user!.organization_id!).order('created_at',{ascending:false}).limit(100);
      if (result.error) throw result.error;
      return result.data as Memo[];
    },
  });
  const history = useQuery({
    queryKey: ['memo-history', user?.organization_id, historyProduct, historyWarehouse, historyPage],
    enabled: Boolean(user?.organization_id),
    queryFn: async () => {
      let query = createClient().from('inventory_movements').select('*').eq('organization_id', user!.organization_id!).order('created_at',{ascending:false}).range(historyPage*50,historyPage*50+49);
      if (historyProduct !== 'all') query=query.eq('product_id',historyProduct);
      if (historyWarehouse !== 'all') query=query.eq('warehouse_id',historyWarehouse);
      const result = await query;
      if (result.error) throw result.error;
      return result.data as Movement[];
    },
  });
  const refresh = () => {
    void cache.invalidateQueries({queryKey:['warehouse-memos']});
    void cache.invalidateQueries({queryKey:['memo-history']});
    void cache.invalidateQueries({queryKey:['inventory']});
    void cache.invalidateQueries({queryKey:['pos-products']});
  };
  const action = useMutation({
    mutationFn: async (run: () => Promise<void>) => run(),
    onSuccess: () => { refresh(); setActiveMemo(null); toast.success('Warehouse memo saved'); },
    onError: error => toast.error(error.message),
  });
  const productName = (id: string) => catalog.data?.products.find(p => p.id===id)?.name || id;
  const warehouseName = (id: string) => catalog.data?.warehouses.find(w => w.id===id)?.name || id;
  const staffName = (id: string | null) => catalog.data?.staff.find(s => s.id===id)?.full_name || '—';
  const selectedItems = (memo: Memo) => memo.approved_items || memo.actual_items || memo.expected_items;
  const startEntry = (memo: Memo) => {
    setActiveMemo(memo);
    setCounts(Object.fromEntries(selectedItems(memo).map(item => [item.product_id,String(item.quantity)])));
    setReason('');
  };
  const parsedCounts = (memo: Memo): Item[] => memo.expected_items.map(item => ({ product_id: item.product_id, quantity: Number(counts[item.product_id]) }));
  const validItems = (rows: Item[], positive: boolean) => rows.length>0 && rows.every(row => row.product_id && Number.isSafeInteger(row.quantity) && (positive ? row.quantity>0 : row.quantity>=0)) && new Set(rows.map(row=>row.product_id)).size===rows.length;
  const createMemo = (send: boolean) => {
    const location = warehouseId || catalog.data?.warehouses[0]?.id;
    if (!location || reference.trim().length<3 || !validItems(items,true)) return toast.error('Choose a warehouse, reference, and valid product quantities.');
    action.mutate(async () => {
      const { error } = await createClient().rpc('create_warehouse_memo',{p_warehouse:location,p_direction:direction,p_reference:reference.trim(),p_items:items,p_send:send});
      if (error) throw error;
      setReference(''); setItems([{product_id:'',quantity:1}]);
    });
  };
  const submitReview = () => {
    if (!activeMemo) return;
    const rows=parsedCounts(activeMemo);
    if (!validItems(rows,false)) return toast.error('Enter a whole-number count for every product.');
    const changed=JSON.stringify(rows)!==JSON.stringify(activeMemo.approved_items || activeMemo.actual_items);
    if (owner && changed && reason.trim().length<3) return toast.error('Explain the correction.');
    action.mutate(async () => {
      const db=createClient();
      const result=owner
        ? await db.rpc('review_warehouse_memo',{p_memo:activeMemo.id,p_items:rows,p_reason:reason.trim()})
        : await db.rpc('submit_warehouse_memo',{p_memo:activeMemo.id,p_items:rows});
      if (result.error) throw result.error;
    });
  };

  return <div className="space-y-6">
    <div><h1 className="tt-page-title">Warehouse memos</h1><p className="text-sm text-muted-foreground">Send stock instructions, record what arrived or left, and review each person’s work. Staff submissions cannot be edited afterward.</p></div>
    {owner && <Card><CardContent className="space-y-4 p-4">
      <h2 className="font-semibold">New memo</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="memo-location">Warehouse</Label><select id="memo-location" className="tt-input" value={warehouseId || catalog.data?.warehouses[0]?.id || ''} onChange={e=>setWarehouseId(e.target.value)}>{catalog.data?.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <div><Label htmlFor="memo-direction">Movement</Label><select id="memo-direction" className="tt-input" value={direction} onChange={e=>setDirection(e.target.value as 'in'|'out')}><option value="in">Stock in</option><option value="out">Stock out</option></select></div>
        <div><Label htmlFor="memo-reference">Shipment or instruction reference</Label><Input id="memo-reference" value={reference} onChange={e=>setReference(e.target.value)} placeholder="e.g. Laptop shipment 1042" /></div>
      </div>
      {items.map((item,index)=><div key={index} className="flex flex-wrap items-end gap-2"><div className="min-w-48 flex-1"><Label htmlFor={`memo-product-${index}`}>Product</Label><select id={`memo-product-${index}`} className="tt-input" value={item.product_id} onChange={e=>setItems(rows=>rows.map((row,i)=>i===index?{...row,product_id:e.target.value}:row))}><option value="">Choose product</option>{catalog.data?.products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></div><div className="w-32"><Label htmlFor={`memo-quantity-${index}`}>Expected units</Label><Input id={`memo-quantity-${index}`} type="number" min="1" step="1" value={item.quantity} onChange={e=>setItems(rows=>rows.map((row,i)=>i===index?{...row,quantity:Number(e.target.value)}:row))} /></div><Button variant="outline" type="button" disabled={items.length===1} onClick={()=>setItems(rows=>rows.filter((_,i)=>i!==index))}>Remove</Button></div>)}
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setItems(rows=>[...rows,{product_id:'',quantity:1}])}>Add product</Button><Button variant="outline" disabled={action.isPending} onClick={()=>createMemo(false)}>Save draft</Button><Button disabled={action.isPending} onClick={()=>createMemo(true)}>Send to warehouse</Button></div>
    </CardContent></Card>}
    <section className="space-y-3"><h2 className="tt-section-title">Memos</h2>{memos.isError && <p role="alert" className="text-destructive">{memos.error.message} <button onClick={()=>void memos.refetch()}>Retry</button></p>}{memos.isLoading && <p>Loading memos…</p>}{memos.data?.length===0 && <p className="text-sm text-muted-foreground">No memos yet.</p>}{memos.data?.map(memo=><Card key={memo.id}><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{memo.reference}</p><p className="text-xs text-muted-foreground">{warehouseName(memo.warehouse_id)} · Stock {memo.direction} · {formatDateTime(memo.created_at)} · {memo.status}</p></div><div className="flex gap-2">{owner && memo.status==='draft' && <Button disabled={action.isPending} onClick={()=>action.mutate(async()=>{const result=await createClient().rpc('send_warehouse_memo',{p_memo:memo.id});if(result.error) throw result.error;})}>Send memo</Button>}{!owner && memo.status==='sent' && <Button onClick={()=>startEntry(memo)}>Record shipment</Button>}{owner && (memo.status==='submitted' || memo.status==='approved') && <Button variant="outline" onClick={()=>startEntry(memo)}>{memo.status==='approved'?'Correct review':'Review and approve'}</Button>}</div></div><div className="grid gap-2 text-sm sm:grid-cols-2">{memo.expected_items.map(item=><div key={item.product_id} className="rounded border p-2"><strong>{productName(item.product_id)}</strong><p>Expected {item.quantity} · Staff {memo.actual_items?.find(row=>row.product_id===item.product_id)?.quantity ?? '—'} · Approved {memo.approved_items?.find(row=>row.product_id===item.product_id)?.quantity ?? '—'}</p></div>)}</div><p className="text-xs text-muted-foreground">Created by {staffName(memo.created_by)} · Entered by {staffName(memo.submitted_by)} · Reviewed by {staffName(memo.reviewed_by)}</p>{memo.review_reason && <p className="text-xs">Correction: {memo.review_reason}</p>}</CardContent></Card>)}</section>
    {activeMemo && <div role="dialog" aria-modal="true" aria-labelledby="memo-review-heading" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto"><CardContent className="space-y-4 p-5"><h2 id="memo-review-heading" className="text-lg font-semibold">{owner?'Review shipment':'Record actual shipment'} · {activeMemo.reference}</h2><p className="text-sm text-muted-foreground">{owner?'Corrections change stock by the difference and remain in the history.':'Submit once. Your entry cannot be edited afterward.'}</p>{activeMemo.expected_items.map(item=><div key={item.product_id} className="grid grid-cols-2 items-end gap-3"><p>{productName(item.product_id)}<br/><span className="text-xs text-muted-foreground">Expected {item.quantity}</span></p><div><Label htmlFor={`count-${item.product_id}`}>Actual units</Label><Input id={`count-${item.product_id}`} type="number" min="0" step="1" value={counts[item.product_id] ?? ''} onChange={e=>setCounts(value=>({...value,[item.product_id]:e.target.value}))} /></div></div>)}{owner && <div><Label htmlFor="review-reason">Reason for a correction</Label><Textarea id="review-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required if changing the staff count" /></div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setActiveMemo(null)}>Cancel</Button><Button disabled={action.isPending} onClick={submitReview}>{owner?'Approve or correct':'Submit count'}</Button></div></CardContent></Card></div>}
    <section className="space-y-3"><h2 className="tt-section-title">Product and warehouse history</h2><p className="text-sm text-muted-foreground">All movements include the staff member, time, and reason. Choose a product for its individual history, or All products for the collective history.</p><div className="flex flex-wrap gap-2"><select aria-label="History product" className="tt-input" value={historyProduct} onChange={e=>{setHistoryProduct(e.target.value);setHistoryPage(0);}}><option value="all">All products</option>{catalog.data?.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="History warehouse" className="tt-input" value={historyWarehouse} onChange={e=>{setHistoryWarehouse(e.target.value);setHistoryPage(0);}}><option value="all">All warehouses</option>{catalog.data?.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>{history.isError && <p role="alert" className="text-destructive">{history.error.message}</p>}{history.isLoading && <p>Loading history…</p>}<div className="space-y-2">{history.data?.map(row=><div key={row.id} className="flex flex-wrap justify-between gap-2 rounded border p-3 text-sm"><span><strong>{productName(row.product_id)}</strong> · {warehouseName(row.warehouse_id)} · {row.movement_type} {row.quantity>0?'+':''}{row.quantity}</span><span>{staffName(row.created_by)} · {formatDateTime(row.created_at)} · {row.notes || 'Stock movement'}</span></div>)}</div><div className="flex items-center gap-3"><Button variant="outline" disabled={historyPage===0} onClick={()=>setHistoryPage(page=>page-1)}>Previous</Button><span className="text-sm">Page {historyPage+1}</span><Button variant="outline" disabled={(history.data?.length ?? 0)<50} onClick={()=>setHistoryPage(page=>page+1)}>Next</Button></div></section>
  </div>;
}
