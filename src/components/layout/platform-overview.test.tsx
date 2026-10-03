// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({keys:[] as unknown[][], functions:[] as Array<()=>Promise<unknown>>, error:null as Error|null, fail:true, select:vi.fn()}));
vi.mock('@/store',()=>({useAuthStore:()=>({user:{role:'platform_owner'}})}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({from:()=>{const q:any={};for(const name of ['order','limit','eq'])q[name]=()=>q;q.select=(...args:unknown[])=>{state.select(...args);return q;};q.then=(resolve:any)=>Promise.resolve(state.fail?{data:null,error:{message:'Connection unavailable'}}:{count:125,error:null}).then(resolve);return q;}})}));
vi.mock('@/i18n',()=>({useI18n:()=>({t:{admin:new Proxy({},{get:(_t,k)=>String(k)})}})}));
vi.mock('@tanstack/react-query',()=>({useQuery:({queryKey,queryFn}: {queryKey:unknown[],queryFn:()=>Promise<unknown>})=>{state.keys.push(queryKey);state.functions.push(queryFn);return {data:[],isLoading:false,error:state.error};}}));
import Admin from '@/app/(dashboard)/admin/page';
it.each([375,1280])('renders platform management actions, truthful empty metrics, and refresh at %ipx',async width=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(window,'innerWidth',{configurable:true,value:width});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    await act(()=>root.render(<Admin />));
    expect(host.querySelector('h1')?.textContent).toContain('Platform overview');
    expect(host.querySelector('a[href="/merchants"]')).not.toBeNull();
    expect(host.querySelector('a[href="/subscriptions"]')).not.toBeNull();
    expect(host.querySelector('a[href="/pos"]')).toBeNull();
    expect(host.textContent).not.toContain('systems_operational');expect(host.textContent).not.toContain('8.3%');
    await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()==='refresh')!.click());
    expect(state.keys).toContainEqual(['admin-merchants',1]);
    const revenue=Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]')).find(b=>b.textContent==='revenue')!;
    await act(()=>{revenue.focus();revenue.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));});
    expect(host.textContent).toContain('Latest month collected');
  } finally {await act(()=>root.unmount());host.remove();}
});
it('surfaces failed database reads and renders retry instead of empty metrics',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);state.functions=[];
  try{
    await act(()=>root.render(<Admin />));
    for(const query of state.functions.slice(0,5))await expect(query()).rejects.toThrow('Connection unavailable');
    state.error=new Error('Connection unavailable');await act(()=>root.render(<Admin />));
    expect(host.textContent).toContain('Could not load platform data');expect(host.textContent).not.toContain('Latest month collected');
    await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Try again'))!.click());
    expect(state.keys).toContainEqual(['admin-merchants',1]);
  }finally{state.error=null;await act(()=>root.unmount());host.remove();}
});
it('requests exact head-only platform counts independently of the bounded directory',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');const root=createRoot(host);state.functions=[];state.fail=false;state.select.mockClear();
  try{await act(()=>root.render(<Admin />));await expect(state.functions[4]()).resolves.toMatchObject({total:125,active:125,pending:125});expect(state.select).toHaveBeenCalledTimes(5);expect(state.select).toHaveBeenCalledWith('id',{count:'exact',head:true});}
  finally{state.fail=true;await act(()=>root.unmount());}
});
