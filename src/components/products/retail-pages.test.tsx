// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/store',()=>({useAuthStore:()=>({user:{id:'owner',organization_id:'org',role:'business_owner'}}),useOrgStore:()=>({currency:'NGN'})}));
vi.mock('@/i18n',()=>({useI18n:()=>({t:new Proxy({},{get:()=>new Proxy({},{get:(_t,k)=>String(k)})})})}));
vi.mock('@/components/shared/access-guard',()=>({AccessGuard:({children}:any)=>children}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({from:()=>{const q:any={};for(const k of ['select','eq','order','limit','gte','lte','or'])q[k]=()=>q;q.then=(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve);return q;}})}));
import Warehouses from '@/app/(dashboard)/warehouses/page';
import Sales from '@/app/(dashboard)/sales/page';
import Users from '@/app/(dashboard)/users/page';
import Merchants from '@/app/(dashboard)/merchants/page';
import Receipts from '@/app/(dashboard)/receipts/lookup/page';
it.each([375,1280])('renders migrated page shells at %ipx without changing receipt lookup/reset behavior',async width=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(window,'innerWidth',{configurable:true,value:width});
 const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>new Response(JSON.stringify(String(url).includes('/api/receipts/')?{kind:'sale',receipt:{invoiceNumber:'TEST-1',dateISO:'2026-09-30T12:00:00Z',status:'completed',paymentMethod:'cash',subtotal:100,discount:0,tax:0,total:100,amountPaid:100,changeAmount:0,items:[]}}:{users:[]})));
 try{
  for(const Page of [Warehouses,Sales,Users,Merchants,Receipts]){
   const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
   try{
    await act(async()=>root.render(<QueryClientProvider client={client}><Page /></QueryClientProvider>));
    expect(host.querySelector('h1')?.classList.contains('tt-page-title')).toBe(true);
    if(Page===Receipts){
     const input=host.querySelector('input')!;
     await act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'TEST-1');input.dispatchEvent(new Event('input',{bubbles:true}));});
     await act(async()=>host.querySelector('button')!.click());
     expect(host.textContent).toContain('TEST-1');expect(fetchMock).toHaveBeenCalledWith('/api/receipts/lookup?code=TEST-1');
     await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='scan_another')!.click());
     expect(host.querySelector('input')!.value).toBe('');
    }
   }finally{await act(()=>root.unmount());client.clear();host.remove();}
  }
 }finally{fetchMock.mockRestore();}
});
