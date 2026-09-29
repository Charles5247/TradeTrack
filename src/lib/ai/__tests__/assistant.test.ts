import { describe, expect, it } from 'vitest';
import { hasAIEntitlement, PLAN_ORDER } from '../entitlement';
import { MockAIProvider } from '../mock';
describe('AI entitlement', () => {
  const state = { active: true, server_time: '2026-09-01T00:00:00Z' };
  it.each(PLAN_ORDER.map((plan_id,i) => [plan_id,i >= 2] as const))('maps catalog tier %s', (plan_id, allowed) => {
    expect(hasAIEntitlement({ ...state, plan_id })).toBe(allowed);
  });
  it('requires active state and server time, grants only an unexpired introduction', () => {
    expect(hasAIEntitlement({ ...state, trial_ends_at: '2026-09-02' })).toBe(true);
    expect(hasAIEntitlement({ ...state, trial_ends_at: '2026-09-01' })).toBe(false);
    expect(hasAIEntitlement({ ...state, active: false, plan_id: PLAN_ORDER[4] })).toBe(false);
    expect(hasAIEntitlement({ ...state, server_time: 'invalid', plan_id: PLAN_ORDER[4] })).toBe(false);
    expect(hasAIEntitlement({ ...state, plan_id: 'Growth' })).toBe(false);
  });
});
describe('mock assistant', () => {
  it('maps inventory into the existing import contract without executing writes', async () => {
    const rows = await new MockAIProvider().mapInventory('name,sku,price,quantity\nRice,RICE,500,4');
    expect(rows[0]).toMatchObject({ name: 'Rice', sku: 'RICE' });
    expect(await new MockAIProvider().mapInventory('Beans 5 100')).toEqual([{ name: 'Beans', sku: 'DRAFT-1', opening_stock: '5', selling_price: '100', cost_price: '' }]);
  });
  it('labels insights as stubs and limits claims to supplied business data', async () => {
    const insights = await new MockAIProvider().insights({ productCount: 2, unitsOnHand: 3, stockCost: 15, salesTotal: 20, saleCount: 1, lowStock: [{ name: 'Rice', quantity: 3 }] });
    expect(insights.every(i => i.title.startsWith('Stub:') && i.source === 'organization-data-only')).toBe(true);
    expect(insights[2].message).toContain('20.00');
    expect(insights[2].message).toContain('No external market data');
  });
});
