// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const { update, insert, match }=vi.hoisted(()=>({update:vi.fn(),insert:vi.fn(),match:{id:'10000000-0000-0000-0000-000000000001',organization_id:'org',name:'Rice',sku:'RICE',barcode:'123',cost_price:100,selling_price:150,status:'active',supplier_id:'supplier',created_by:'creator'}}));
vi.mock('./image-upload',()=>({ImageUpload:({onProductMatched}:any)=><><button type="button" onClick={()=>onProductMatched(match,false)}>Select online match</button><button type="button" onClick={()=>onProductMatched(match,true)}>Select cached match</button></>}));
vi.mock('@/lib/utils/client-audit',()=>({createAuditEntry:vi.fn()}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:(table:string)=>table==='users'?{select:()=>({eq:()=>({single:async()=>({data:{organization_id:'org'}})})})}:{update,insert}})}));
import { ProductForm } from './product-form';
it('prefills an existing match and updates its ID rather than inserting a duplicate',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const eq=vi.fn().mockResolvedValue({error:null});update.mockReturnValue({eq});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const success=vi.fn();
 try{
  await act(()=>root.render(<ProductForm categories={[]} onSuccess={success} onCancel={vi.fn()} />));
  await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Select online match')!.click());
  expect(host.querySelector<HTMLInputElement>('#name')!.value).toBe('Rice');expect(host.querySelector<HTMLInputElement>('#sku')!.value).toBe('RICE');
  await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(eq).toHaveBeenCalledWith('id',match.id);expect(insert).not.toHaveBeenCalled();expect(success).toHaveBeenCalled();
  expect(update.mock.calls[0][0]).toMatchObject({supplier_id:'supplier',created_by:'creator'});
  await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Select cached match')!.click());
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
 }finally{await act(()=>root.unmount());host.remove();}
});
