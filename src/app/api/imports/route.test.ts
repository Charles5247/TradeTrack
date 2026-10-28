import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),upsert:vi.fn()}));
vi.mock('@/lib/auth/api-context',()=>({apiContext:async()=>({org:'org',profile:{id:'owner'},db:{from:()=>({upsert:mocks.upsert}),rpc:mocks.rpc}})}));
import { POST } from './route';
beforeEach(()=>{mocks.rpc.mockReset().mockResolvedValue({data:[],error:null});mocks.upsert.mockReset().mockResolvedValue({error:null});});
const row={index:1,id:'product',data:{name:'Drug',sku:'001',selling_price:'20',cost_price:'10',opening_stock:'0'},original:{'Item Name':'Drug',notes:'keep original'},fixes:[{field:'opening_stock',from:'-1',to:'0',reason:'Negative stock',severity:'review'}],reviewAccepted:true};
const send=(value:unknown)=>POST(new Request('http://localhost/api/imports',{method:'POST',body:JSON.stringify({confirm:true,action:'import',kind:'products',batch_id:'batch',mode:'skip',warehouse_id:'warehouse',rows:[value]})}));
it('passes original records and reviewed changes to the atomic import RPC',async()=>{
 expect((await send(row)).status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith('apply_import_chunk',expect.objectContaining({import_rows:[expect.objectContaining({data:expect.objectContaining({_import_source:row.original,_import_fixes:row.fixes,_import_review_accepted:true})})]}));
});
it.each([{...row,reviewAccepted:false},{...row,blocked:['Unreadable quantity']}])('rejects unresolved decisions before writing',async value=>{
 expect((await send(value)).status).toBe(400);expect(mocks.upsert).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
