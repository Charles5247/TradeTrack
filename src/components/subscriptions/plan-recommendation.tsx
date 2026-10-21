'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { useCopy } from '@/i18n/text';
import { formatCurrency } from '@/lib/utils/format';
import type { RecommendationPlan, TrialUsage } from '@/lib/subscriptions/recommend-plan';

type Recommendation={plan:RecommendationPlan|null;usage:TrialUsage;provisional:boolean};
export function PlanRecommendation(){
 const copy=useCopy();const {user}=useAuthStore();
 const {data,error,isLoading}=useQuery<Recommendation>({queryKey:['plan-recommendation',user?.id,user?.organization_id],enabled:user?.role==='business_owner',staleTime:60000,queryFn:async()=>{const response=await fetch('/api/subscriptions/recommendation',{cache:'no-store'});if(!response.ok)throw new Error('Unavailable');return response.json();}});
 if(user?.role!=='business_owner')return null;
 return <section className="space-y-3 rounded-xl border border-border bg-card p-5" aria-label={copy('Your recommended plan')}>
  <h2 className="text-lg font-semibold">{copy('Your recommended plan')}</h2>
  {isLoading?<p>{copy('Checking your business usage…')}</p>:error||!data?<p>{copy('Connect to load complete usage and current plans.')}</p>:<>
   <p className="text-xl font-semibold">{data.plan?`${data.plan.name} · ${formatCurrency(data.plan.price)} / ${copy('month')}`:copy('Contact us for a suitable plan')}</p>
   <p className="text-sm text-muted-foreground">{copy('Based on your first 30 days of recorded activity and your current products, cashiers and locations.')}</p>
   <p className="text-sm">{copy('{products} products · {cashiers} cashiers · {warehouses} locations · {sales} trial sales',data.usage)}</p>
   <p className="text-sm">{data.plan?copy('The lowest-priced monthly plan that fits these needs. You choose whether to subscribe.'):copy('No current self-service plan covers all your recorded needs.')}</p>
   {data.provisional&&<p className="text-sm text-muted-foreground">{copy('Provisional suggestion: no completed sales have synced yet.')}</p>}
   <p className="text-xs text-muted-foreground">{copy('Sync pending activity first. This suggestion never charges you or changes your plan automatically.')}</p>
   <Link href="/subscriptions" className="inline-flex min-h-11 items-center font-semibold text-primary underline">{copy('Compare plans')}</Link>
  </>}
 </section>;
}
