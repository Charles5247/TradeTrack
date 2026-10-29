import { expect, it } from 'vitest';
import { mergeSalesHistory } from './history';

const live=[{id:'live-1',created_at:'2026-02-01T00:00:00Z',invoice_number:'LIVE'}];
const imported=[
 {id:'old-1',invoice_number:'OLD',sold_at:'2026-03-01T00:00:00Z',total:10,amount_paid:10,payment_method:'cash',status:'active' as const},
 {id:'old-2',invoice_number:'REVERSED',sold_at:'2026-04-01T00:00:00Z',total:20,amount_paid:20,payment_method:'cash',status:'reversed' as const},
];
it('merges by sale date, labels sources and hides reversed imports',()=>{
 expect(mergeSalesHistory(live,imported,'all').map(row=>[row.id,row.source])).toEqual([['old-1','imported'],['live-1','trackasuwa']]);
});
it('filters TracKasuwa and imported sources independently',()=>{
 expect(mergeSalesHistory(live,imported,'trackasuwa').map(row=>row.id)).toEqual(['live-1']);
 expect(mergeSalesHistory(live,imported,'imported').map(row=>row.id)).toEqual(['old-1']);
});
