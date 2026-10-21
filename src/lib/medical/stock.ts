/** Shared deterministic rules. Server authorization is still required at commit. */
export type MedicalBatchStatus = 'available' | 'quarantined' | 'recalled';
export interface MedicalBatch {
  id: string;
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  batch_number: string;
  expires_on: string; // Last usable date, explicitly entered as YYYY-MM-DD.
  quantity: number; // Whole smallest dispensable units.
  status: MedicalBatchStatus;
}
export interface BatchAllocation { batch_id: string; quantity: number }

export function assertDateOnly(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('A full expiry date is required');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) {
    throw new Error('Invalid expiry date');
  }
}

export function nigeriaBusinessDate(time: Date): string {
  if (!Number.isFinite(time.getTime())) throw new Error('A valid business time is required');
  return new Date(time.getTime() + 60 * 60 * 1000).toISOString().slice(0,10);
}

export function toBaseUnits(packCount: number, unitsPerPack: number, looseUnits = 0): number {
  for (const n of [packCount, unitsPerPack, looseUnits]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Quantities must be non-negative whole numbers');
  }
  if (unitsPerPack < 1) throw new Error('Units per pack must be at least one');
  const result = packCount * unitsPerPack + looseUnits;
  if (!Number.isSafeInteger(result) || result > 2147483647) throw new Error('Quantity exceeds the supported stock limit');
  return result;
}

/** FEFO, isolated by organization/product/location, without mutating the cache. */
export function allocateMedicalStock(
  batches: readonly MedicalBatch[],
  request: {organization_id:string;product_id:string;warehouse_id:string;quantity:number;business_date:string},
): BatchAllocation[] {
  assertDateOnly(request.business_date);
  if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0 || request.quantity > 2147483647) {
    throw new Error('Issue quantity must be a positive whole number of base units');
  }
  const eligible = batches.filter(batch =>
    batch.organization_id === request.organization_id &&
    batch.product_id === request.product_id &&
    batch.warehouse_id === request.warehouse_id &&
    batch.status === 'available',
  );
  for (const batch of eligible) {
    assertDateOnly(batch.expires_on);
    if (!Number.isSafeInteger(batch.quantity) || batch.quantity < 0) throw new Error('Invalid cached batch quantity; refresh stock');
  }
  const candidates = eligible.filter(batch => batch.expires_on >= request.business_date && batch.quantity > 0)
    .sort((a,b) => a.expires_on.localeCompare(b.expires_on) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  let remaining = request.quantity;
  const allocations: BatchAllocation[] = [];
  for (const batch of candidates) {
    if (seen.has(batch.id)) throw new Error('Duplicate batch in stock snapshot');
    seen.add(batch.id);
    const quantity = Math.min(remaining,batch.quantity);
    if (quantity > 0) allocations.push({batch_id:batch.id,quantity});
    remaining -= quantity;
  }
  if (remaining > 0) throw new Error('Insufficient unexpired, available batch stock');
  return allocations;
}
