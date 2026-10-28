import { expect, it } from 'vitest';
import { billingExpiry, billingPrice } from '../billing-cycle';

it('quotes quarterly and six-month periods without inventing discounts',()=>{
 expect(billingPrice(20000,'quarterly')).toBe(60000);
 expect(billingPrice(20000,'biannual')).toBe(120000);
 expect(billingPrice(20000,'yearly')).toBe(192000);
});
it('clamps expiry to the last day of a shorter month',()=>{
 expect(billingExpiry(new Date('2026-01-31T10:00:00Z'),'quarterly').toISOString()).toBe('2026-04-30T10:00:00.000Z');
 expect(billingExpiry(new Date('2026-08-31T10:00:00Z'),'biannual').toISOString()).toBe('2027-02-28T10:00:00.000Z');
});
