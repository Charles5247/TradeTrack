import { hasFeature, isUnlimitedLimit, type PlanLike } from './plan-limits';

export type RecommendationPlan = PlanLike & {price:number;billing_cycle:string;currency?:string};
export type TrialUsage = {products:number;cashiers:number;warehouses:number;sales:number;purchaseOrders:number;vendorTransactions:number;transfers:number};

/** Recommend capacity, not spending: sales turnover never forces a higher tier. */
export function recommendPlan(plans:RecommendationPlan[], usage:TrialUsage) {
  if(Object.values(usage).some(value=>!Number.isSafeInteger(value)||value<0)) throw new Error('Incomplete usage');
  const required=['pos','inventory','basic_reports'];
  if(usage.purchaseOrders>0)required.push('purchase_orders');
  if(usage.vendorTransactions>0)required.push('vendors');
  if(usage.transfers>0)required.push('warehouses');
  const fits=(plan:RecommendationPlan)=>
    [[usage.products,plan.max_products],[usage.cashiers,plan.max_cashiers],[usage.warehouses,plan.max_warehouses]].every(([count,limit])=>isUnlimitedLimit(limit)||Number(count)<=Number(limit))&&required.every(feature=>hasFeature(plan,feature));
  const candidates=plans.filter(plan=>plan.is_active!==false&&plan.price>0&&plan.name!=='Enterprise'&&plan.name!=='Free'&&plan.billing_cycle==='monthly'&&(!plan.currency||plan.currency==='NGN')&&fits(plan)).sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));
  return {plan:candidates[0]??null,requiredFeatures:required,provisional:usage.sales===0};
}
