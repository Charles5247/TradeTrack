import { describe, expect, it } from 'vitest';
import { allocateMedicalStock, assertDateOnly, nigeriaBusinessDate, toBaseUnits, type MedicalBatch } from './stock';
const batch:MedicalBatch={id:'later',organization_id:'org',product_id:'medicine',warehouse_id:'main',batch_number:'LOT-1',expires_on:'2026-12-31',quantity:10,status:'available'};
const request={organization_id:'org',product_id:'medicine',warehouse_id:'main',quantity:8,business_date:'2026-10-23'};
describe('medical stock rules',()=>{
  it('selects earliest expiry first and splits across batches without changing stock',()=>{
    const batches=[batch,{...batch,id:'earlier',quantity:3,expires_on:'2026-10-31'}];
    expect(allocateMedicalStock(batches,request)).toEqual([{batch_id:'earlier',quantity:3},{batch_id:'later',quantity:5}]);
    expect(batches.map(b=>b.quantity)).toEqual([10,3]);
  });
  it('excludes expired, quarantined, recalled, other location and other organization stock',()=>{
    const unavailable:MedicalBatch[]=[
      {...batch,id:'expired',expires_on:'2026-10-22'},
      {...batch,id:'quarantine',status:'quarantined'},
      {...batch,id:'recall',status:'recalled'},
      {...batch,id:'elsewhere',warehouse_id:'other'},
      {...batch,id:'tenant',organization_id:'other'},
      {...batch,id:'product',product_id:'other'},
    ];
    expect(()=>allocateMedicalStock(unavailable,request)).toThrow('Insufficient');
  });
  it('uses the stated last usable day and Nigeria midnight, independent of device timezone',()=>{
    const date=nigeriaBusinessDate(new Date('2026-10-22T23:00:00Z'));
    expect(date).toBe('2026-10-23');
    expect(allocateMedicalStock([{...batch,expires_on:date}],{...request,business_date:date})).toHaveLength(1);
  });
  it.each(['2026-02-30','2026-13-01','2026-10','invalid'])('rejects ambiguous or invalid dates: %s',date=>expect(()=>assertDateOnly(date)).toThrow());
  it.each([0,-1,1.5,NaN,Infinity,2147483648])('rejects unsafe issue quantity %s',quantity=>expect(()=>allocateMedicalStock([batch],{...request,quantity})).toThrow());
  it('rejects duplicate stock rows instead of double-counting',()=>expect(()=>allocateMedicalStock([batch,batch],{...request,quantity:15})).toThrow('Duplicate'));
  it('converts packs plus loose units without fractional stock',()=>{
    expect(toBaseUnits(2,30,4)).toBe(64);
    expect(()=>toBaseUnits(1.5,30)).toThrow();
    expect(()=>toBaseUnits(1,0)).toThrow();
    expect(()=>toBaseUnits(2147483647,2)).toThrow();
  });
});
