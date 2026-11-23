import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from '../gemini';
import { getAIProvider } from '../provider';

const apiKey = 'synthetic-gemini-key';
const row = {
  name: 'Rice', sku: 'R1', barcode: '0012', cost_price: '8000.50', selling_price: '',
  opening_stock: '5', source_unit: 'Bags', source_reference: 'Line 7',
};

function completed(value: unknown) {
  return Response.json({
    status: 'completed',
    steps: [
      { type: 'thought', summary: [{ type: 'text', text: 'Private intermediate content' }] },
      { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(value) }] },
    ],
    usage: { total_input_tokens: 100, total_output_tokens: 30, total_thought_tokens: 4 },
  });
}

function mockResponse(response: Response) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('requires explicit Gemini selection and ignores any legacy OpenAI key', () => {
  vi.stubEnv('AI_PROVIDER', undefined);
  vi.stubEnv('OPENAI_API_KEY', 'legacy-synthetic-key');
  vi.stubEnv('GEMINI_API_KEY', apiKey);
  expect(getAIProvider()).toMatchObject({ name: 'mock', stub: true });

  vi.stubEnv('AI_PROVIDER', 'openai');
  expect(() => getAIProvider()).toThrow('Choose gemini or mock');
  vi.stubEnv('AI_PROVIDER', 'gemini');
  expect(getAIProvider()).toMatchObject({ name: 'gemini', stub: false });
  vi.stubEnv('GEMINI_API_KEY', ' ');
  expect(() => getAIProvider()).toThrow('server Gemini key');
});

it('uses an explicitly configured server Gemini model', async () => {
  vi.stubEnv('AI_PROVIDER', 'gemini');
  vi.stubEnv('GEMINI_API_KEY', apiKey);
  vi.stubEnv('GEMINI_MODEL', 'gemini-3.6-flash');
  const fetcher = mockResponse(completed({ rows: [] }));
  await getAIProvider().mapInventory('Rice');
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ model: 'gemini-3.6-flash' });
});

it('makes a bounded, stateless Interactions call and records only operational metadata', async () => {
  const fetcher = mockResponse(completed({ rows: [row] }));
  const source = 'Private fixture invoice text';
  const result = await new GeminiProvider(apiKey).mapInventory(source);

  expect(result).toEqual([{ ...row, stock_unit: 'bag' }]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
  expect(init).toMatchObject({
    method: 'POST', redirect: 'error', signal: expect.any(AbortSignal),
    headers: { 'x-goog-api-key': apiKey, 'Api-Revision': '2026-05-20' },
  });
  const request = JSON.parse(String(init?.body));
  expect(request).toMatchObject({
    model: DEFAULT_GEMINI_MODEL, store: false, generation_config: { max_output_tokens: 12000 },
    input: [{ type: 'text', text: source }],
    response_format: { type: 'text', mime_type: 'application/json', schema: expect.any(Object) },
  });
  expect(request).not.toHaveProperty('tools');
  expect(request).not.toHaveProperty('previous_interaction_id');
  expect(console.info).toHaveBeenCalledWith('[ai.gemini]', expect.objectContaining({
    purpose: 'inventory', outcome: 'completed', total_input_tokens: 100,
    total_output_tokens: 30, duration_ms: expect.any(Number),
  }));
  const log = JSON.stringify(vi.mocked(console.info).mock.calls);
  expect(log).not.toContain(source);
  expect(log).not.toContain(apiKey);
  expect(log).not.toContain('Private intermediate content');
});

it('leaves absent and invalid amounts blank without converting units or changing explicit zero', async () => {
  mockResponse(completed({ rows: [
    { ...row, sku: '', cost_price: '', selling_price: '0', opening_stock: '2.5', source_unit: 'cartons of 12' },
    { ...row, cost_price: '250.999', opening_stock: '2147483648', source_unit: '  ' },
  ] }));
  const rows = await new GeminiProvider(apiKey).mapInventory('source');
  expect(rows[0]).toMatchObject({
    sku: '', cost_price: '', selling_price: '0', opening_stock: '',
    source_unit: 'cartons of 12', stock_unit: 'unknown',
  });
  expect(rows[1]).toMatchObject({ cost_price: '', opening_stock: '' });
  expect(rows[1]).not.toHaveProperty('stock_unit');
});

it('passes a supported photo as inline media without a file upload or external tool', async () => {
  const fetcher = mockResponse(completed({ rows: [row] }));
  await new GeminiProvider(apiKey).mapInventoryImage('data:image/jpeg;base64,/9j/');
  const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(request.input).toContainEqual({ type: 'image', mime_type: 'image/jpeg', data: '/9j/' });
  expect(request.store).toBe(false);
  expect(request.system_instruction).toContain('Keep unit buying cost separate from the line total');
});

it('rejects a spoofed media type and an oversized encoded photo before calling Gemini', async () => {
  const fetcher = mockResponse(completed({ rows: [] }));
  const provider = new GeminiProvider(apiKey);
  await expect(provider.mapInventoryImage('data:image/jpeg;base64,YWJj')).rejects.toThrow('JPEG');
  await expect(provider.mapInventoryImage('data:image/jpeg;base64,' + 'A'.repeat(3_000_000))).rejects.toThrow('2 MB');
  expect(fetcher).not.toHaveBeenCalled();
});

it('strips selling price and barcode from an invoice comparison result', async () => {
  mockResponse(completed({ rows: [{ ...row, selling_price: '95' }] }));
  const rows = await new GeminiProvider(apiKey).mapInvoiceImage('data:image/jpeg;base64,/9j/');
  expect(rows[0]).toMatchObject({ selling_price: '', barcode: '', cost_price: '8000.50', stock_unit: 'bag' });
});

it('transcribes existing browser audio formats through Gemini', async () => {
  const fetcher = mockResponse(completed({ transcript: 'Rice 5 bags' }));
  const result = await new GeminiProvider(apiKey).transcribeInventoryAudio('data:audio/mp4;base64,YWJj');
  expect(result).toBe('Rice 5 bags');
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).input)
    .toContainEqual({ type: 'audio', mime_type: 'audio/m4a', data: 'YWJj' });
});

it('requires insights to label the supplied organization records as their only source', async () => {
  mockResponse(completed({ insights: [{ title: 'Unknown source', message: 'Other business data', source: 'outside' }] }));
  await expect(new GeminiProvider(apiKey).insights({
    productCount: 1, unitsOnHand: 1, stockCost: 1, salesTotal: 0, saleCount: 0, lowStock: [],
  })).rejects.toThrow('invalid draft');
});

it('rejects incomplete results and unrecognized draft fields', async () => {
  mockResponse(Response.json({ status: 'incomplete', steps: [] }));
  await expect(new GeminiProvider(apiKey).mapInventory('Rice')).rejects.toThrow('smaller request');

  mockResponse(completed({ rows: [{ ...row, approve_stock: true }] }));
  await expect(new GeminiProvider(apiKey).mapInventory('Rice')).rejects.toThrow('invalid draft');
});

it.each([
  [401, 'server settings'],
  [429, 'usage limit'],
  [503, 'unavailable'],
])('maps HTTP %i to an actionable error without exposing provider data', async (status, message) => {
  mockResponse(new Response('private provider diagnostic', { status }));
  const capture = await new GeminiProvider(apiKey).mapInventory('Rice').catch(error => error);
  expect(capture).toBeInstanceOf(Error);
  expect(capture.message).toContain(message);
  expect(capture.message).not.toContain('private provider diagnostic');
});

it('handles a deadline without retrying the provider request', async () => {
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('private request diagnostic'));
  vi.stubGlobal('fetch', fetcher);
  await expect(new GeminiProvider(apiKey).mapInventory('Rice')).rejects.toThrow('too long');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
