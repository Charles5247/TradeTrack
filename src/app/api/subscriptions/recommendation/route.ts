import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recommendPlan, type RecommendationPlan, type TrialUsage } from '@/lib/subscriptions/recommend-plan';

export async function GET(){
 const db=await createClient();
 if(!db)return NextResponse.json({error:'Sign in to continue.'},{status:401});
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return NextResponse.json({error:'Sign in to continue.'},{status:401});
 const {data:profile}=await db.from('users').select('organization_id,role,status').eq('id',user.id).single();
 if(!profile?.organization_id||profile.role!=='business_owner'||profile.status!=='active')return NextResponse.json({error:'Business owner access required.'},{status:403});
 const org=profile.organization_id;
 // The earliest subscription is the onboarding period; cap observation at 30 days.
 const {data:trial,error:trialError}=await db.from('subscriptions').select('starts_at').eq('organization_id',org).order('starts_at').limit(1).maybeSingle();
 if(trialError||!trial)return NextResponse.json({error:'Trial history is unavailable.'},{status:503});
 const start=new Date(trial.starts_at);
 if(!Number.isFinite(start.getTime())||start.getTime()>Date.now())return NextResponse.json({error:'Trial history is unavailable.'},{status:503});
 const end=new Date(Math.min(Date.now(),start.getTime()+30*86400000)).toISOString();
 const results=await Promise.all([
  db.from('products').select('id',{count:'exact',head:true}).eq('organization_id',org),
  db.from('users').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('role','cashier').eq('status','active'),
  db.from('warehouses').select('id',{count:'exact',head:true}).eq('organization_id',org),
  db.from('sales').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('status','completed').gte('created_at',start.toISOString()).lt('created_at',end),
  db.from('purchase_orders').select('id',{count:'exact',head:true}).eq('organization_id',org).gte('created_at',start.toISOString()).lt('created_at',end),
  db.from('vendor_transactions').select('id',{count:'exact',head:true}).eq('organization_id',org).gte('created_at',start.toISOString()).lt('created_at',end),
  db.from('warehouse_transfers').select('id',{count:'exact',head:true}).eq('organization_id',org).gte('created_at',start.toISOString()).lt('created_at',end),
 ]);
 const {data:plans,error:plansError}=await db.from('subscription_plans').select('*').eq('is_active',true);
 if(plansError||!plans?.length||results.some(result=>result.error||result.count===null))return NextResponse.json({error:'Connect to load complete usage and current plans.'},{status:503});
 const keys=['products','cashiers','warehouses','sales','purchaseOrders','vendorTransactions','transfers'] as const;
 const usage=Object.fromEntries(keys.map((key,i)=>[key,results[i].count])) as TrialUsage;
 return NextResponse.json({...recommendPlan(plans as RecommendationPlan[],usage),usage,period:{start:start.toISOString(),end},generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
}
