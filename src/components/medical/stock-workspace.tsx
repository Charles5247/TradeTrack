'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store';
import { getDB } from '@/lib/offline/db';
import { generateId } from '@/lib/utils/id';
import { toBaseUnits, nigeriaBusinessDate, type MedicalBatch } from '@/lib/medical/stock';
import { useCopy } from '@/i18n/text';

type Product={id:string;name:string;sku:string;selling_price:number;medical_stock_managed:boolean};
type Profile={product_id:string;base_unit:string;units_per_pack:number;classification:string};
type Snapshot={products:Product[];warehouses:{id:string;name:string}[];profiles:Profile[];batches:MedicalBatch[];events:{id:string;kind:string;quantity:number;source_reference:string;created_at:string}[]};
const empty:Snapshot={products:[],warehouses:[],profiles:[],batches:[],events:[]};
const input='mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2';
const button='min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50';

export function MedicalStockWorkspace(){
 const {user}=useAuthStore();
 return <MedicalStockWorkspaceForAccount key={`${user?.organization_id}:${user?.id}`} />;
}

function MedicalStockWorkspaceForAccount(){
 const copy=useCopy();const {user}=useAuthStore();
 const [data,setData]=useState<Snapshot>(empty);const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);
 const [stale,setStale]=useState(false);const [action,setAction]=useState<'receive'|'issue'>('receive');
 const [productId,setProductId]=useState('');const [warehouse,setWarehouse]=useState('');
 const [draft,setDraft]=useState<Record<string,unknown>|null>(null);
 const [canDiscard,setCanDiscard]=useState(false);
 const attempt=useRef<{body:string;id:string}|null>(null);
 const preparing=useRef(false);
 const sending=useRef(false);
 const key=user?.id&&user.organization_id?`medical-stock:${user.organization_id}:${user.id}`:null;
 const profile=data.profiles.find(p=>p.product_id===productId);
 const product=data.products.find(p=>p.id===productId);
 const manager=user?.role==='business_owner'||user?.role==='admin';
 function sameAccount(){const current=useAuthStore.getState().user;return !!user&&current?.id===user.id&&current?.organization_id===user.organization_id;}
 async function load(){
  if(!key)return;
  const db=await getDB();
  try{
   const response=await fetch('/api/medical-stock',{cache:'no-store'});
   const result=await response.json();
   if(!sameAccount())return;
   if(!response.ok)throw new Error(result.error);
   setData(result);setStale(false);
   await db.put('app_meta',{id:key,data:result});
  }catch(error){
   if(!sameAccount())return;
   const cached=await db.get('app_meta',key);
   if(cached?.data){setData(cached.data);setStale(true);}
   else setStatus(error instanceof Error?error.message:'Connect to load medical stock.');
  }
  const saved=await db.get('app_meta',`${key}:draft`);setDraft(saved?.data??null);
 }
 useEffect(()=>{void load();},[key]); // Account-scoped cache; no background dispensing.
 async function commit(raw:Record<string,unknown>){
  if(!key||preparing.current||sending.current||draft||!sameAccount())return;
  preparing.current=true;setBusy(true);
  try{
  const body=JSON.stringify(raw);
  if(raw.action!=='register'){
   setCanDiscard(false);
   if(attempt.current?.body!==body)attempt.current={body,id:generateId()};
   raw={...raw,request_id:attempt.current.id};
   // Persist the id BEFORE sending: a lost response retries the same operation.
   const db=await getDB();await db.put('app_meta',{id:`${key}:draft`,data:raw});setDraft(raw);
  }
  if(!navigator.onLine){setStatus('Draft saved only. Stock has not moved. Reconnect before handing over goods.');return;}
  await send(raw);
  }catch(error){setStatus(error instanceof Error?error.message:'Could not save the request. No stock operation was sent.');}
  finally{preparing.current=false;setBusy(false);}
 }
 async function send(body:Record<string,unknown>){
  if(!key||sending.current||!sameAccount())return;sending.current=true;setBusy(true);
  try{
   const response=await fetch('/api/medical-stock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json();
   if(!response.ok){setCanDiscard(response.status===400||response.status===409);throw new Error(result.error);}
   setStatus('Committed successfully. The stock record is saved.');
   if(body.action!=='register'){await (await getDB()).delete('app_meta',`${key}:draft`);setDraft(null);attempt.current=null;setCanDiscard(false);}
   await load();
  }catch(error){setStatus(error instanceof Error?error.message:'No confirmation received. Keep the draft and retry; do not record it twice.');}
  finally{sending.current=false;setBusy(false);}
 }
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  try{
   if(draft)throw new Error('Resolve the saved request before starting another operation.');
   if(!profile)throw new Error('Select a batch-managed product.');
   const values=Object.fromEntries(new FormData(event.currentTarget));
   const quantity=toBaseUnits(Number(values.packs),profile.units_per_pack,Number(values.loose));
   const shared={action,target_product:productId,target_warehouse:warehouse,reason:String(values.reason)};
   if(action==='receive')await commit({...shared,lot_number:String(values.lot),expiry_date:String(values.expiry),received_units:quantity,source_reference:String(values.reference)});
   else await commit({...shared,issued_units:quantity,issue_kind:String(values.kind),recipient_reference:String(values.reference),expected_unit_price:values.kind==='free_issue'?0:Number(product?.selling_price),payment_method:String(values.payment)});
  }catch(error){setStatus(error instanceof Error?error.message:'Check the form.');}
 }
 const today=nigeriaBusinessDate(new Date());
 return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
  <header><p className="text-sm text-muted-foreground">{copy('Medical inventory pilot')}</p><h1 className="mt-1 text-3xl font-semibold">{copy('Batches, expiry and stock issues')}</h1><p className="mt-3 text-sm text-muted-foreground">{copy('Stock quantities and prices use the smallest base unit. Prescription and controlled dispensing are not enabled.')}</p></header>
  <div className="rounded-xl border border-border bg-card p-4 text-sm">{copy('Offline entries are drafts only. Reconnect and confirm before handing over goods.')} {stale&&<strong>{copy('Showing cached stock; availability must be rechecked online.')}</strong>}</div>
  {status&&<p role="status" className="rounded-lg border border-border p-3">{copy(status)}</p>}
  {draft&&<div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"><h2 className="font-semibold">{copy('Saved request — confirmation pending')}</h2><p className="break-all text-sm">{String(draft.action)} · {String(draft.request_id)}</p><p className="text-sm">{copy('Retry uses the same reference and cannot create a duplicate. Do not create a replacement while its outcome is unknown.')}</p><button className={button} disabled={busy} onClick={()=>void send(draft)}>{copy('Retry saved request')}</button>{canDiscard&&<button className="ml-3 min-h-11 underline" disabled={busy} onClick={async()=>{if(!key)return;await(await getDB()).delete('app_meta',`${key}:draft`);setDraft(null);attempt.current=null;setCanDiscard(false);setStatus('Rejected request discarded. Correct the details and submit again.');}}>{copy('Discard rejected request')}</button>}</div>}
  <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
   <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="text-xl font-semibold">{copy('Record a stock operation')}</h2>
    <label className="block text-sm">{copy('Operation')}<select className={input} value={action} onChange={e=>setAction(e.target.value as 'receive'|'issue')}><option value="receive" disabled={!manager}>{copy('Receive stock')}</option><option value="issue">{copy('Sell or issue stock')}</option></select></label>
    <label className="block text-sm">{copy('Product')}<select required className={input} value={productId} onChange={e=>setProductId(e.target.value)}><option value="">{copy('Choose a product')}</option>{data.products.filter(p=>p.medical_stock_managed).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
    <label className="block text-sm">{copy('Storage location')}<select required className={input} value={warehouse} onChange={e=>setWarehouse(e.target.value)}><option value="">{copy('Choose a location')}</option>{data.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
    {profile&&<p className="text-sm text-muted-foreground">{profile.units_per_pack} {profile.base_unit} / pack · {profile.classification}</p>}
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">{copy('Full packs')}<input name="packs" type="number" min="0" step="1" defaultValue="0" required className={input}/></label><label className="text-sm">{copy('Loose base units')}<input name="loose" type="number" min="0" step="1" defaultValue="0" required className={input}/></label></div>
    {action==='receive'?<><label className="block text-sm">{copy('Batch / lot number')}<input name="lot" required maxLength={100} className={input}/></label><label className="block text-sm">{copy('Last usable date (full date required)')}<input name="expiry" type="date" required className={input}/></label></>:<><label className="block text-sm">{copy('Issue type')}<select name="kind" className={input}><option value="sale">{copy('Sale')}</option>{manager&&<option value="free_issue">{copy('Free issue — no revenue')}</option>}</select></label><label className="block text-sm">{copy('Payment method for sales')}<select name="payment" className={input}><option value="cash">{copy('Cash')}</option><option value="transfer">{copy('Transfer')}</option><option value="pos_terminal">{copy('POS terminal')}</option></select></label><p className="text-sm">{copy('Sales must be fully paid.')} ₦{Number(product?.selling_price??0).toLocaleString('en-NG')} / {profile?.base_unit}</p></>}
    <label className="block text-sm">{copy(action==='receive'?'Supplier invoice reference':'Recipient / ward reference')}<input name="reference" required minLength={3} maxLength={200} className={input}/></label>
    <label className="block text-sm">{copy('Reason / source record')}<input name="reason" required minLength={3} maxLength={1000} className={input}/></label>
    <button disabled={busy||!!draft||(!manager&&action==='receive')} className={button}>{copy('Confirm stock operation')}</button>
   </form>
   <section className="min-w-0 rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{copy('Batch stock')}</h2><button type="button" onClick={()=>void load()} className="min-h-11 text-primary underline">{copy('Refresh')}</button></div><p className="my-3 text-sm text-muted-foreground">{copy('Earliest expiry first. Expired and held stock cannot be issued.')}</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Product / batch','Expiry','Units','Status'].map(t=><th key={t} className="border-b border-border p-2">{copy(t)}</th>)}</tr></thead><tbody>{data.batches.filter(b=>(!productId||b.product_id===productId)&&(!warehouse||b.warehouse_id===warehouse)).map(b=><tr key={b.id}><td className="border-b border-border p-2">{data.products.find(p=>p.id===b.product_id)?.name}<br/><span className="text-muted-foreground">{b.batch_number} · {data.warehouses.find(w=>w.id===b.warehouse_id)?.name}</span></td><td className="p-2">{b.expires_on}</td><td className="p-2 tabular-nums">{b.quantity}</td><td className="p-2">{copy(b.expires_on<today?'Expired':b.status)}</td></tr>)}</tbody></table></div>{!data.batches.length&&<p className="py-6 text-muted-foreground">{copy('No batch stock received yet.')}</p>}</section>
  </div>
  {manager&&<form className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));void commit({action:'register',target_product:String(v.product),base_unit:String(v.unit),units_per_pack:Number(v.size),classification:String(v.classification)});}}><h2 className="text-xl font-semibold">{copy('Enroll a product for batch tracking')}</h2><p className="text-sm text-muted-foreground">{copy('Use a product with no existing stock. Enrollment blocks ordinary POS and stock edits for this product. Product prices must be per base unit.')}</p><div className="grid gap-4 sm:grid-cols-2"><label>{copy('Product')}<select name="product" required className={input}><option value="">{copy('Choose a product')}</option>{data.products.filter(p=>!p.medical_stock_managed).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{copy('Smallest base unit')}<input name="unit" required maxLength={40} placeholder="tablet / bottle / vial" className={input}/></label><label>{copy('Base units per pack')}<input name="size" type="number" min="1" max="100000" step="1" required className={input}/></label><label>{copy('Classification')}<select name="classification" className={input}><option value="general">{copy('General stock')}</option><option value="prescription">{copy('Prescription — intake only')}</option><option value="controlled">{copy('Controlled — intake only')}</option></select></label></div><button disabled={busy||!!draft} className={button}>{copy('Enroll product')}</button></form>}
  <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-semibold">{copy('Recent stock history')}</h2><ul className="mt-3 divide-y divide-border">{data.events.map(event=><li key={event.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{event.kind} · {event.quantity} · {event.source_reference}</span><time>{new Date(event.created_at).toLocaleString('en-NG')}</time></li>)}</ul></section>
 </div>;
}
