import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn(),insert:vi.fn(),fetch:vi.fn(),role:'business_owner',saveError:null as null|{message:string}}));
vi.mock('@/lib/subscriptions/zainpay-checkout',async importOriginal=>({
 ...await importOriginal<typeof import('@/lib/subscriptions/zainpay-checkout')>(),
 paymentAdmin:()=>({auth:{getUser:mocks.getUser},from:mocks.from}),
}));
vi.mock('@/lib/zainpay-config',()=>({getZainpayConfig:()=>({mode:'live',publicKey:'server-key',baseUrl:'https://api.zainpay.ng',defaultZainbox:'server-box'})}));
import { POST } from './route';
beforeEach(()=>{
 vi.clearAllMocks();mocks.role='business_owner';mocks.saveError=null;
 vi.stubEnv('NEXT_PUBLIC_APP_URL','https://trackasuwa.vercel.app');
 mocks.getUser.mockResolvedValue({data:{user:{id:'owner',email:'owner@example.com'}},error:null});
 mocks.insert.mockImplementation(async()=>({error:mocks.saveError}));
 mocks.from.mockImplementation(table=>({
  insert:mocks.insert,
  select:()=>({eq:()=>({single:async()=>({error:null,data:table==='users'?{organization_id:'org-from-auth',role:mocks.role,phone:'08012345678'}:{id:'plan-from-db',name:'Business',price:20000,currency:'NGN',billing_cycle:'monthly',is_active:true}})})}),
 }));
 mocks.fetch.mockResolvedValue(new Response(JSON.stringify({code:'00',data:'https://pay.zainpay.ng/checkout'})));
 vi.stubGlobal('fetch',mocks.fetch);
});
const request=(body:object,auth=true)=>new NextRequest('https://trackasuwa.vercel.app/api/payments/initialize',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer session-token'}:{})},body:JSON.stringify(body)});
it('derives price, identity and destination on the server, ignoring tampering',async()=>{
 const response=await POST(request({planId:'requested-plan',billingCycle:'quarterly',amount:1,email:'attacker@example.com',zainboxCode:'attacker-box',txnRef:'chosen',organization_id:'other-org'}));
 expect(response.status).toBe(200);
 expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({amount_kobo:6000000,organization_id:'org-from-auth',user_id:'owner',plan_id:'plan-from-db',zainbox_code:'server-box',billing_cycle:'quarterly'}));
 const body=JSON.parse(mocks.fetch.mock.calls[0][1].body);
 expect(body).toMatchObject({amount:'6000000',emailAddress:'owner@example.com',zainboxCode:'server-box'});
 expect(body.callBackUrl).toContain('/api/payments/verify?txnRef=TT-');
 expect(body).not.toHaveProperty('callbackUrl');
 expect(body.txnRef).not.toBe('chosen');
});
it('does not contact the provider if the durable checkout cannot be saved',async()=>{
 mocks.saveError={message:'database unavailable'};
 expect((await POST(request({planId:'p',billingCycle:'monthly'}))).status).toBe(503);
 expect(mocks.fetch).not.toHaveBeenCalled();
});
it('rejects unauthenticated users and non-owners',async()=>{
 expect((await POST(request({},false))).status).toBe(401);
 mocks.role='cashier';expect((await POST(request({planId:'p',billingCycle:'monthly'}))).status).toBe(403);
 expect(mocks.insert).not.toHaveBeenCalled();
});
it.each(['quarter','constructor','__proto__',''])('rejects invalid billing cycle %s',async cycle=>{
 expect((await POST(request({planId:'p',billingCycle:cycle}))).status).toBe(400);
 expect(mocks.fetch).not.toHaveBeenCalled();
});

it('requires a payment phone number before contacting the provider',async()=>{expect((await POST(request({planId:'p',billingCycle:'monthly',mobile:'bad'}))).status).toBe(400);expect(mocks.fetch).not.toHaveBeenCalled();});
it('retries temporary Zainpay gateway failures and keeps the same checkout reference',async()=>{
 mocks.fetch.mockResolvedValueOnce(new Response('<html>bad gateway</html>',{status:502})).mockResolvedValueOnce(new Response(JSON.stringify({code:'00',data:'https://pay.zainpay.ng/checkout'})));
 const response=await POST(request({planId:'p',billingCycle:'monthly'}));
 expect(response.status).toBe(200);expect(mocks.fetch).toHaveBeenCalledTimes(2);
 const first=JSON.parse(mocks.fetch.mock.calls[0][1].body);const second=JSON.parse(mocks.fetch.mock.calls[1][1].body);
 expect(first.txnRef).toBe(second.txnRef);
});
it('returns a retryable message when Zainpay remains unavailable',async()=>{
 mocks.fetch.mockResolvedValue(new Response('<html>bad gateway</html>',{status:502}));
 const response=await POST(request({planId:'p',billingCycle:'monthly'}));
 expect(response.status).toBe(503);expect(mocks.fetch).toHaveBeenCalledTimes(3);
 expect(await response.json()).toMatchObject({error:expect.stringContaining('temporarily unavailable')});
});
