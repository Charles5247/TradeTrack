// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({role:'platform_owner',mutate:vi.fn()}));
vi.mock('@/store',()=>({useAuthStore:()=>({user:{role:state.role}})}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({})}));
vi.mock('@/i18n',()=>({useI18n:()=>({t:new Proxy({},{get:()=>new Proxy({},{get:(_t,k)=>String(k)})})})}));
vi.mock('@tanstack/react-query',()=>({
  useQuery:()=>({data:{plans:[{id:'growth',name:'Growth',price:15000,billing_cycle:'monthly',max_cashiers:5,max_products:3000,max_warehouses:6,features:[],is_active:true,is_popular:false}],payments:[],subscription:null},isLoading:false}),
  useQueryClient:()=>({invalidateQueries:vi.fn()}),useMutation:()=>({mutate:state.mutate,isPending:false}),
}));
import Subscriptions from '@/app/(dashboard)/subscriptions/page';
import {TooltipProvider} from '@/components/ui/tooltip';
it('shows platform catalog management without merchant billing or checkout and preserves merchant plan selection',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const render=()=>root.render(<TooltipProvider><Subscriptions /></TooltipProvider>);
  try{
    await act(render);expect(host.querySelector('h1')?.textContent).toContain('Subscription plans');
    expect(host.textContent).toContain('Growth');expect(host.textContent).not.toContain('tab_billing');expect(host.textContent).not.toContain('select_plan');
    await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()==='edit_plan')!.click());
    expect(document.querySelector('[role=dialog] input')?.getAttribute('value')).toBe('Growth');expect(state.mutate).not.toHaveBeenCalled();
    await act(()=>document.querySelector<HTMLButtonElement>('[role=dialog] button:last-child')!.click());
    state.role='business_owner';await act(render);
    const plans=Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]')).find(b=>b.textContent==='tab_plans')!;
    await act(()=>{plans.focus();plans.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));});
    const select=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='select_plan')!;
    expect(select).toBeDefined();await act(()=>select.click());expect(state.mutate).toHaveBeenCalledWith({planId:'growth',cycle:'monthly'});
  }finally{await act(()=>root.unmount());host.remove();}
});
