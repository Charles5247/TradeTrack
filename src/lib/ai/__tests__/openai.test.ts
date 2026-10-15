import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { OpenAIProvider } from '../openai';
afterEach(() => vi.unstubAllGlobals());
const completed = (value: unknown) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
it('requests a private structured draft without giving the model write tools', async () => {
  const rows = [{ name: 'Rice', sku: 'R1', barcode: '', cost_price: '', selling_price: '100', opening_stock: '5' }];
  const fetcher = vi.fn().mockResolvedValue(completed({ rows })); vi.stubGlobal('fetch', fetcher);
  expect(await new OpenAIProvider('test-key').mapInventory('Rice R1 5 100')).toEqual(rows);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true); expect(body.tools).toBeUndefined();
});
it('rejects malformed and incomplete output instead of returning a partial inventory', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completed({ rows: [{ arbitrary: 'field' }] })));
  await expect(new OpenAIProvider('key').mapInventory('Rice')).rejects.toThrow('invalid draft');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'incomplete', output: [] })));
  await expect(new OpenAIProvider('key').mapInventory('Rice')).rejects.toThrow('smaller request');
});
it('does not expose provider error bodies or credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret diagnostic', { status: 401 })));
  await expect(new OpenAIProvider('secret-key').mapInventory('Rice')).rejects.toThrow('configuration');
});
