import { beforeEach,expect,it,vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
const mock=vi.hoisted(()=>({send:vi.fn(),update:vi.fn(),insert:vi.fn(),result:{data:{id:'saved'},error:null as null|{code:string}}}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from:()=>({update:(value:unknown)=>{mock.update(value);return {eq:async()=>({error:null})};},insert:(value:unknown)=>{mock.insert(value);return {select:()=>({single:async()=>mock.result})};}})})}));
vi.mock('resend',()=>({Resend:class {emails={send:mock.send};}}));
beforeEach(()=>{mock.send.mockReset();mock.update.mockClear();vi.stubEnv('CONTACT_EMAIL_FROM','TracKasuwa <notifications@mail.example.com>');vi.stubEnv('CONTACT_EMAIL_TO','owner@example.com');mock.insert.mockClear();mock.result={data:{id:'saved'},error:null};vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-only');vi.stubEnv('RESEND_API_KEY','');});
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

it('uses the configured inbox and a stable contact idempotency key',async()=>{
 vi.stubEnv('RESEND_API_KEY','test-only');mock.send.mockResolvedValue({data:{id:'email-test'},error:null});
 const response=await POST(new NextRequest('http://localhost/api/contact',{method:'POST',body:JSON.stringify(message)}));
 expect(response.status).toBe(201);
 expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({to:['owner@example.com']}),expect.objectContaining({idempotencyKey:'contact/saved'}));
 expect(mock.update).toHaveBeenCalledWith({email_status:'sent'});
});
it('keeps the saved message pending when Resend rejects delivery',async()=>{
 vi.stubEnv('RESEND_API_KEY','test-only');mock.send.mockResolvedValue({data:null,error:{name:'validation_error'}});
 const response=await POST(new NextRequest('http://localhost/api/contact',{method:'POST',body:JSON.stringify(message)}));
 expect(response.status).toBe(201);expect(mock.update).not.toHaveBeenCalled();
});
