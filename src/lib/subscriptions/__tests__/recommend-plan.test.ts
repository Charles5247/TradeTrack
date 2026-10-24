import { expect,it } from 'vitest';
import { recommendPlan,type RecommendationPlan,type TrialUsage } from '../recommend-plan';
const base:TrialUsage={products:100,cashiers:1,warehouses:1,sales:80,purchaseOrders:0,vendorTransactions:0,transfers:0};
const starter:RecommendationPlan={id:'starter',name:'Starter',price:5000,billing_cycle:'monthly',is_active:true,max_products:500,max_cashiers:2,max_warehouses:1,features:['pos','inventory','basic_reports']};
const business:RecommendationPlan={...starter,id:'business',name:'Business',price:20000,max_products:5000,max_cashiers:10,max_warehouses:-1,features:['sales','inventory','reports','vendor_consignment','warehouse_transfers']};
it('suggests the least expensive fitting plan regardless of revenue or sale count',()=>{
 expect(recommendPlan([business,starter],{...base,sales:100000}).plan?.id).toBe('starter');
});
it('respects capacity and legacy feature names',()=>{
 expect(recommendPlan([starter,business],{...base,products:600,warehouses:3,transfers:4,vendorTransactions:2}).plan?.id).toBe('business');
});
it('does not invent availability for features missing from the live catalog',()=>{
 expect(recommendPlan([starter,business],{...base,purchaseOrders:1}).plan).toBeNull();
});
it('excludes inactive, free, yearly and custom-priced Enterprise plans',()=>{
 const invalid=[{...starter,is_active:false},{...starter,price:0},{...starter,billing_cycle:'yearly'},{...starter,name:'Enterprise'}];
 expect(recommendPlan(invalid,base).plan).toBeNull();
});
it('marks empty activity provisional and rejects incomplete counts',()=>{
 expect(recommendPlan([starter],{...base,sales:0}).provisional).toBe(true);
 expect(()=>recommendPlan([starter],{...base,products:NaN})).toThrow('Incomplete usage');
});
