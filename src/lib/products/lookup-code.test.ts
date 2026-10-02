// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const { from, cached } = vi.hoisted(() => ({ from: vi.fn(), cached: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from }) }));
vi.mock('@/lib/offline/db', () => ({ getDB: async () => ({ getAll: cached }) }));
import { lookupProductCode } from './lookup-code';
beforeEach(() => { vi.restoreAllMocks(); from.mockReset(); cached.mockReset(); });
it('looks up exact codes within the current business and deduplicates barcode/SKU matches', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  const eq = vi.fn().mockReturnThis(); const p = { id: 'one', name: 'Rice' };
  from.mockReturnValue({ select: () => ({ eq, limit: async () => ({ data: [p], error: null }) }) });
  expect(await lookupProductCode(' code,with.punctuation ', 'org')).toEqual({ product: p, cached: false });
  expect(eq.mock.calls).toEqual([['organization_id','org'],['barcode','code,with.punctuation'],['organization_id','org'],['sku','code,with.punctuation']]);
});
it('uses only current-business cached products offline and makes no network call', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const p = { id:'own', organization_id:'org', barcode:'123' };
  cached.mockResolvedValue([{ id:'other', organization_id:'another', barcode:'123' },p]);
  expect(await lookupProductCode('123','org')).toEqual({ product:p,cached:true });
  expect(from).not.toHaveBeenCalled();
});
it('does not interpret an incomplete offline cache as a confirmed missing product', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); cached.mockResolvedValue([]);
  expect(await lookupProductCode('123','org')).toEqual({product:null,cached:true});
});
it('rejects ambiguous codes and missing business membership', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  cached.mockResolvedValue([{id:'1',organization_id:'org',barcode:'x'},{id:'2',organization_id:'org',sku:'x'}]);
  await expect(lookupProductCode('x','org')).rejects.toThrow('More than one');
  await expect(lookupProductCode('x','')).rejects.toThrow('membership');
});
it('distinguishes a failed online request from no match', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); cached.mockResolvedValue([]);
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: async () => ({error:{message:'offline'},data:null}) }; from.mockReturnValue(q);
  await expect(lookupProductCode('123','org')).rejects.toThrow('unavailable');
});
