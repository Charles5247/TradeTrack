import { beforeEach,expect,it,vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
const mock=vi.hoisted(()=>({insert:vi.fn(),result:{data:{id:'saved'},error:null as null|{code:string}}}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from:()=>({insert:(value:unknown)=>{mock.insert(value);return {select:()=>({single:async()=>mock.result})};}})})}));
beforeEach(()=>{mock.insert.mockClear();mock.result={data:{id:'saved'},error:null};vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-only');vi.stubEnv('RESEND_API_KEY','');});
const message={name:'Test trader',business_name:'Test shop',phone:'08012345678',message:'Please help me install the app.'};
it('stores a validated message without claiming email was sent',async()=>{
 const response=await POST(new NextRequest('http://localhost/api/contact',{method:'POST',body:JSON.stringify(message)}));
 expect(response.status).toBe(201);expect(await response.json()).toEqual({saved:true});expect(mock.insert).toHaveBeenCalledWith(message);
});
it('rejects invalid input before writing',async()=>{
 const response=await POST(new NextRequest('http://localhost/api/contact',{method:'POST',body:'{}'}));
 expect(response.status).toBe(400);expect(mock.insert).not.toHaveBeenCalled();
});
it('does not report success when storage fails',async()=>{
 mock.result.error={code:'42P01'};
 const response=await POST(new NextRequest('http://localhost/api/contact',{method:'POST',body:JSON.stringify(message)}));
 expect(response.status).toBe(503);
});
