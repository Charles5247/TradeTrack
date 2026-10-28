export const BILLING_MONTHS = { monthly: 1, quarterly: 3, biannual: 6, yearly: 12 } as const;
export type BillingCycle = keyof typeof BILLING_MONTHS;

/** New periods use the monthly rate; retain the existing annual 20% discount. */
export function billingPrice(monthlyPrice: number, cycle: BillingCycle): number {
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) throw new Error('Invalid monthly price');
  return Math.round(monthlyPrice * BILLING_MONTHS[cycle] * (cycle === 'yearly' ? 0.8 : 1) * 100) / 100;
}

/** Calendar-month expiry, clamped at month end (Jan 31 -> Apr 30). */
export function billingExpiry(start: Date, cycle: BillingCycle): Date {
  const result = new Date(start);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + BILLING_MONTHS[cycle]);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
