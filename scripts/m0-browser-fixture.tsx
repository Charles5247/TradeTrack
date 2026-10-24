// Isolated browser demonstration, bundled only by verify-m0-browser.mjs.
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useQueryClient} from '@tanstack/react-query';
import {QueryProvider} from '@/components/shared/query-provider';
import {CheckoutRecovery} from '@/components/inventory/checkout-recovery';
import {AdjustmentRecovery} from '@/components/inventory/adjustment-recovery';
import {ManualStockIntake} from '@/components/inventory/manual-stock-intake';
import {useAuthStore,useCartStore} from '@/store';
import {getDB} from '@/lib/offline/db';
import {persistOfflineSale} from '@/lib/offline/sales';
import {recordInventoryAdjustment} from '@/lib/offline/inventory-adjustment';
import {parseImportFile} from '@/lib/imports/parse';
import type {User} from '@/types';

interface Seed {profile:User;other:User;products:Record<string,unknown>[];inventory:Record<string,unknown>[];warehouse:string}
let seed:Seed;
const originalFetch=window.fetch.bind(window);
window.fetch=(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 if(url.startsWith('/api/stock-intakes')){const headers=new Headers(init?.headers);headers.set('x-m0-actor',useAuthStore.getState().user?.id??'');return originalFetch(input,{...init,headers});}
 return originalFetch(input,init);
};
function App(){
 const [message,setMessage]=useState('Loading isolated fixture…'),[stock,setStock]=useState(''),[ready,setReady]=useState(false);
 const user=useAuthStore(state=>state.user),cache=useQueryClient();
 const initialized=useRef(false);
 const refresh=useCallback(async()=>{setStock(await(await fetch('/stock')).text());await cache.invalidateQueries();},[cache]);
 useEffect(()=>{if(initialized.current)return;initialized.current=true;void(async()=>{
  seed=await(await fetch('/seed')).json();useAuthStore.getState().setUser(seed.profile);
  const db=await getDB();for(const row of seed.products)await db.put('products',row);for(const row of seed.inventory)if(!await db.get('inventory',String(row.id)))await db.put('inventory',row);
  await db.put('app_meta',{id:`subscription:${seed.profile.organization_id}`,active:true,verifiedAt:Date.now(),lastSeen:Date.now()});
  setReady(true);setMessage('Fixture ready. All records are synthetic.');await refresh();
 })().catch(error=>setMessage(String(error)));},[refresh]);
 async function action(task:()=>Promise<void>){try{await task();await refresh();}catch(error){setMessage(error instanceof Error?error.message:String(error));}}
 async function save(){
  if(user?.id!==seed.profile.id)throw new Error('Return to the test shop first.');
  for(let index=0;index<2;index++)await persistOfflineSale({cashier_id:seed.profile.id,organization_id:seed.profile.organization_id!,warehouse_id:seed.warehouse,
   invoice_number:`BROWSER-${crypto.randomUUID()}`,items:[{product_id:String(seed.products[0].id),warehouse_id:seed.warehouse,quantity:1,unit_price:100,cost_price:50,discount:0,total:100}],
   subtotal:100,discount:0,tax:0,total:100,amount_paid:0,change_amount:0,payment_method:'partial'});
  setMessage('Two checkouts saved locally. Review each original receipt below.');
 }
 const cartRows=useCartStore(state=>state.items.length);
 const manual=window.location.pathname==='/m1';
 return <main className="mx-auto max-w-4xl p-4 space-y-5"><h1 className="tt-page-title">{manual?'M1':'M0'} isolated verification</h1>
  <p>Real application components with a loopback RPC adapter and disposable PostgreSQL. This fixture does not test hosted JWT/session issuance.</p>
  <p role="status">{message}</p><p>Current account: {user?.organization_id===seed?.profile.organization_id?'Test shop':'Other shop'}</p><p>Server stock: <output>{stock}</output></p>
  <div className="flex flex-wrap gap-3">
   <button disabled={!ready} onClick={()=>void action(save)}>Save two offline checkouts</button>
   <button disabled={!ready} onClick={()=>void action(async()=>{await fetch(manual?'/lose-next-intake':'/lose-next',{method:'POST'});setMessage('Next RPC acknowledgment will be lost after commit.');})}>Lose next acknowledgment</button>
   <button disabled={!ready} onClick={()=>void action(async()=>{
    const original=Object.getOwnPropertyDescriptor(Navigator.prototype,'onLine');Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});
    try{await recordInventoryAdjustment({organization_id:seed.profile.organization_id!,user_id:seed.profile.id,product_id:String(seed.products[0].id),warehouse_id:seed.warehouse,quantity_change:2,movement_type:'in',reason:'Reviewed synthetic delivery'});}
    finally{if(original)Object.defineProperty(navigator,'onLine',original);else delete (navigator as unknown as Record<string,unknown>).onLine;}
    setMessage('Adjustment saved locally; review it below.');
   })}>Save offline adjustment</button>
   <button disabled={!ready} onClick={()=>{useAuthStore.getState().setUser(seed.other);setMessage('Switched account. Prior shop receipts and cart must be absent.');}}>Switch to other shop</button>
   <button disabled={!ready} onClick={()=>{useAuthStore.getState().setUser(seed.profile);setMessage('Returned to the original shop. Saved work remains available.');}}>Return to test shop</button>
   <button onClick={()=>void action(refresh)}>Refresh server stock</button>
  </div>
  {manual?<ManualStockIntake/>:<><p>Current cart rows: {cartRows}</p>
  <CheckoutRecovery/><AdjustmentRecovery/>
  <section className="rounded-lg border p-4 space-y-3"><h2>Worker parser verification</h2><label htmlFor="m0-file">Choose a synthetic CSV or XLSX</label>
   <input id="m0-file" type="file" accept=".csv,.xlsx" onChange={event=>{const file=event.target.files?.[0];if(file)void action(async()=>{
    const began=performance.now();let ticks=0;const timer=setInterval(()=>{ticks++;},10);
    try{const rows=await parseImportFile(file);setMessage(`Prepared ${rows.length} rows; UI heartbeat ${ticks}; elapsed ${Math.round(performance.now()-began)} ms.`);}finally{clearInterval(timer);}
   });}}/>
  </section>
  </>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<QueryProvider><App/></QueryProvider>);
