// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({mutate:vi.fn(),invalidate:vi.fn(),update:vi.fn(),reportQuery:null as null|(()=>Promise<unknown>),queryData:{daily:[],sales:[{id:'sale-1',total:100,imported:false}]}}));
vi.mock('@/components/shared/access-guard',()=>({AccessGuard:({children}:any)=>children}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({from:()=>{const q:any={};for(const name of ['select','gte','eq','limit'])q[name]=()=>q;q.then=(resolve:any)=>Promise.resolve({data:null,error:{message:'Report unavailable'}}).then(resolve);return q;}})}));
vi.mock('@/components/imports/import-workbench',()=>({ImportWorkbench:()=>null}));
vi.mock('@/i18n',()=>({useI18n:()=>({t:{notifications:new Proxy({},{get:(_t,k)=>String(k)})}})}));
vi.mock('@tanstack/react-query',()=>({
  useQuery:({queryKey,queryFn}:any)=>{if(queryKey[0]==='reports'){mocks.reportQuery=queryFn;return {data:{topProducts:[],dailyChart:[],pmChartData:[]},isLoading:false};}return {data:queryKey[0]==='notifications'?[{id:'n1',title:'Review account',message:'Action required',type:'default',is_read:false,created_at:new Date().toISOString()}]:mocks.queryData,isLoading:false};},
  useQueryClient:()=>({invalidateQueries:mocks.invalidate}),useMutation:()=>({mutate:mocks.mutate,isPending:false}),
}));
import Accounting from '@/app/(dashboard)/accounting/page';
import Notifications from '@/app/(dashboard)/notifications/page';
import Assistant from '@/app/(dashboard)/assistant/page';
import Reports from '@/app/(dashboard)/reports/page';
import {getFlatNavItems} from './nav-config';
it('keeps accounting changes behind review, reason, and explicit confirmation',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const request=vi.fn(async(_url:RequestInfo | URL,_init?:RequestInit)=>new Response('{}'));vi.stubGlobal('fetch',request);
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    await act(()=>root.render(<Accounting />));expect(host.textContent).toContain('No entries for this report');
    await act(()=>{const select=host.querySelector('select')!;select.value='sales';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='refund')!.click());
    let dialog=document.querySelector('[role=dialog]')!;expect(dialog).not.toBeNull();expect(request).not.toHaveBeenCalled();
    let confirm=Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Confirm and sign')!;expect(confirm.disabled).toBe(true);
    await act(()=>Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Cancel')!.click());expect(request).not.toHaveBeenCalled();
    await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='refund')!.click());dialog=document.querySelector('[role=dialog]')!;
    await act(()=>{const area=dialog.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'Customer return');area.dispatchEvent(new Event('input',{bubbles:true}));});
    confirm=Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Confirm and sign')!;
    await act(async()=>confirm.click());expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toMatchObject({sale_id:'sale-1',kind:'refund',reason:'Customer return',confirm:true});
  }finally{await act(()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
it('lets keyboard users mark a notification read',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});mocks.mutate.mockClear();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{await act(()=>root.render(<Notifications />));const notification=host.querySelector('[aria-label="Mark as read: Review account"]')!;
    await act(()=>notification.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(mocks.mutate).toHaveBeenCalledWith('n1');
  }finally{await act(()=>root.unmount());host.remove();}
});
it('exposes existing business tools only to permitted roles',()=>{
  for(const role of ['business_owner','admin'] as const)expect(getFlatNavItems(role).map(i=>i.href)).toEqual(expect.arrayContaining(['/warehouses','/imports','/accounting','/assistant']));
  for(const role of ['cashier','platform_owner'] as const)expect(getFlatNavItems(role).map(i=>i.href)).not.toEqual(expect.arrayContaining(['/imports','/accounting']));
});
it('renders report empty states and propagates read failures instead of zero metrics',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');const root=createRoot(host);
  try{await act(()=>root.render(<Reports />));expect(host.textContent).toContain('No payment data');expect(host.textContent).toContain('No products sold');await expect(mocks.reportQuery!()).rejects.toThrow('Report unavailable');}
  finally{await act(()=>root.unmount());}
});
it('preserves assistant opt-in controls and requires an explicit delivery action',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const request=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>new Response(JSON.stringify(!init?{preferences:{in_app:false,email:false,sms:false},channels:{in_app:true,email:false,sms:false}}:JSON.parse(init.body as string).action==='insights'?{job:'insight',insights:[{title:'Stock review',message:'Review stock levels.'}]}:{})));vi.stubGlobal('fetch',request);
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(<Assistant />));
    await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Generate organization-only insights')!.click());
    expect(host.textContent).toContain('Stock review');expect(request.mock.calls.some(([,init])=>init?.body?.toString().includes('"deliver"'))).toBe(false);
    await act(()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Confirm delivery preferences')!.click());
    expect(JSON.parse(request.mock.calls.at(-1)![1]!.body as string)).toMatchObject({action:'preferences',in_app:true,email:false,sms:false,confirm:true});
    expect(host.textContent).toContain('Delivery preferences saved.');
  }finally{await act(()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
