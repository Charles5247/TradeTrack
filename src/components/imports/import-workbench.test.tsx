// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn().mockResolvedValue([{row_number:1,outcome:'create'}]),parse:vi.fn(),catalog:vi.fn().mockResolvedValue([]),user:{id:'owner',organization_id:'org',role:'business_owner'}}));
vi.mock('@/store',()=>({useAuthStore:(select:any)=>select({user:mocks.user})}));
vi.mock('@/lib/offline/db',()=>({getDB:async()=>({getAll:async()=>[{id:'warehouse',name:'Main warehouse',organization_id:'org'}]})}));
vi.mock('@/lib/offline/sync-engine',()=>({syncEngine:{sync:vi.fn()}}));
vi.mock('@/lib/imports/execute',()=>({executeImport:mocks.execute,loadImportCatalog:mocks.catalog}));
vi.mock('@/lib/imports/parse',()=>({parseImportFile:mocks.parse}));
import {ImportWorkbench} from './import-workbench';
it.each([375,1280])('requires preview and confirmation before importing at %ipx',async width=>{
  mocks.execute.mockClear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(window,'innerWidth',{configurable:true,value:width});
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('kind=warehouses')?[{id:'warehouse',name:'Main warehouse'}]:[]))));
  const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
  try {
    const source=[{name:'Rice',sku:'RICE',price:'NGN 100',qty:width===375?0:-1,legacy_note:'preserve this'}];
    mocks.parse.mockResolvedValue(source);
    await act(async()=>root.render(<QueryClientProvider client={client}><ImportWorkbench /></QueryClientProvider>));
    const file=new File(['representative export'],'merchant-export.csv',{type:'text/csv'});
    const input=host.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input,'files',{configurable:true,value:[file]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    expect(mocks.parse).toHaveBeenCalledWith(file);
    await act(async()=>button('Validate and preview').click());
    expect(host.textContent).toContain('Choose a warehouse');expect(mocks.execute).not.toHaveBeenCalled();
    const warehouse=Array.from(host.querySelectorAll('select')).find(s=>s.parentElement?.textContent?.startsWith('Opening-stock warehouse'))!;
    // Use the same native select change event as a mobile browser.
    await act(()=>{warehouse.value='warehouse';warehouse.dispatchEvent(new Event('change',{bubbles:true}));});
    await act(async()=>button('Validate and preview').click());
    expect(host.textContent).toContain('1 create');expect(mocks.execute).not.toHaveBeenCalled();
    expect(host.textContent).toContain('rows auto-fixed');
    if(width===1280){expect(button('Confirm 1 rows').disabled).toBe(true);await act(()=>{host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();});}
    await act(async()=>{button('Confirm 1 rows').click();await new Promise(resolve=>setTimeout(resolve,20));});
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({kind:'products',warehouseId:'warehouse',org:'org'}),expect.any(Function));
    expect(mocks.execute.mock.calls[0][0].rows[0]).toMatchObject({original:{legacy_note:'preserve this'},fixes:expect.arrayContaining([expect.objectContaining({field:'selling_price'})])});
    expect(button('Confirm 1 rows').disabled).toBe(true);
  }finally{await act(()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();}
});
