// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const { lookup }=vi.hoisted(()=>({lookup:vi.fn()}));
vi.mock('@/store',()=>({useAuthStore:()=>({user:{organization_id:'org'}})}));
vi.mock('@/lib/products/lookup-code',()=>({lookupProductCode:lookup}));
import { ProductCodeLookup } from './product-code-lookup';
it.each(['match','missing','cached-missing','error'])('handles %s with explicit confirmation and no photo attachment',async state=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const match={id:'existing',name:'Rice',sku:'RICE'};
 if(state==='error') lookup.mockRejectedValueOnce(new Error('Network unavailable'));
 else lookup.mockResolvedValueOnce({product:state==='match'?match:null,cached:state==='cached-missing'});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onMatch=vi.fn(),onCode=vi.fn();
 try {
  await act(()=>root.render(<ProductCodeLookup onMatch={onMatch} onCode={onCode} />));
  const input=host.querySelector('input[id="product-code"]')!;
  await act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'123');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Find product')!.click();});
  expect(lookup).toHaveBeenLastCalledWith('123','org');expect(onMatch).not.toHaveBeenCalled();
  if(state==='match'){await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Use this product')!.click());expect(onMatch).toHaveBeenCalledWith(match,false);}
  if(state==='missing'){await act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Use code in form')!.click());expect(onCode).toHaveBeenCalledWith('123');}
  if(state==='cached-missing'){expect(host.textContent).toContain('offline cache');expect(host.textContent).not.toContain('Use code in form');}
  if(state==='error')expect(host.querySelector('[role="alert"]')?.textContent).toBe('Network unavailable');
 }finally{await act(()=>root.unmount());host.remove();}
});
