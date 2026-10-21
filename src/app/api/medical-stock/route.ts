import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const uuid=z.string().uuid();
const units=z.number().int().min(1).max(2147483647);
const text=z.string().trim().min(3).max(200);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('register'),target_product:uuid,base_unit:z.string().trim().min(1).max(40),units_per_pack:z.number().int().min(1).max(100000),classification:z.enum(['general','prescription','controlled'])}).strict(),
 z.object({action:z.literal('receive'),request_id:uuid,target_product:uuid,target_warehouse:uuid,lot_number:z.string().trim().min(1).max(100),expiry_date:z.iso.date(),received_units:units,source_reference:text,reason:z.string().trim().min(3).max(1000)}).strict(),
 z.object({action:z.literal('issue'),request_id:uuid,target_product:uuid,target_warehouse:uuid,issued_units:units,issue_kind:z.enum(['sale','free_issue']),recipient_reference:text,reason:z.string().trim().min(3).max(1000),expected_unit_price:z.number().finite().nonnegative().max(9999999999),payment_method:z.enum(['cash','transfer','pos_terminal'])}).strict(),
]);
async function session() {
 const client=await createClient();
 if(!client)return null;
 const {data:{user},error}=await client.auth.getUser();
 if(error||!user)return null;
 // New tables are not yet in the generated schema; DB RLS remains authoritative.
 return client as SupabaseClient;
}
export async function GET() {
 const db=await session();
 if(!db)return NextResponse.json({error:'Sign in to continue.'},{status:401});
 if(process.env.MEDICAL_STOCK_PILOT_ENABLED!=='true')return NextResponse.json({error:'Medical stock pilot is not enabled.'},{status:503});
 const results=await Promise.all([
  db.from('products').select('id,name,sku,selling_price,medical_stock_managed').eq('status','active').order('name').limit(1000),
  db.from('warehouses').select('id,name').order('name'),
  db.from('medical_products').select('*').limit(1000),
  db.from('medical_batches').select('*').order('expires_on').limit(1000),
  db.from('medical_stock_events').select('id,batch_id,kind,quantity,source_reference,reason,created_at').order('created_at',{ascending:false}).limit(100),
 ]);
 if(results.some(result=>result.error))return NextResponse.json({error:'Medical stock could not be loaded. Reconnect and try again.'},{status:503});
 return NextResponse.json(Object.fromEntries(['products','warehouses','profiles','batches','events'].map((key,i)=>[key,results[i].data])),{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:NextRequest) {
 if(request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
 const db=await session();
 if(!db)return NextResponse.json({error:'Sign in to continue.'},{status:401});
 if(process.env.MEDICAL_STOCK_PILOT_ENABLED!=='true')return NextResponse.json({error:'Medical stock pilot is not enabled.'},{status:503});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Check the required fields and whole-unit quantities.'},{status:400});
 const {action,...args}=parsed.data;
 const procedure={register:'register_medical_product',receive:'receive_medical_batch',issue:'issue_medical_stock'}[action];
 const {data,error}=await db.rpc(procedure,args);
 if(error){
  const safe=error.code==='P0001' ? error.message : 'The operation was not committed. Check the details and retry.';
  return NextResponse.json({error:safe},{status:409});
 }
 return NextResponse.json({record:data},{headers:{'Cache-Control':'private, no-store'}});
}
