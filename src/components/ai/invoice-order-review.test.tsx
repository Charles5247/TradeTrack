// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: { id: 'owner', organization_id: 'org', role: 'business_owner', status: 'active' },
}));
vi.mock('@/store', () => ({ useAuthStore: Object.assign(
  (select: (state: { user: typeof mock.user }) => unknown) => select({ user: mock.user }),
  { getState: () => ({ user: mock.user }) },
) }));
vi.mock('@/i18n/text', () => ({ useCopy: () => (value: string) => value }));
import { InvoiceOrderReview } from './invoice-order-review';

const orders = [{ id: 'order', created_at: '2026-11-01T12:00:00Z', supplier: { name: 'Fixture supplier' } }];
const result = { order: { id: 'order', supplier: { name: 'Fixture supplier' } }, ready: true,
  orderOutstandingValue: 300, invoiceValue: 300, matched: [], short: [] };
const requests = vi.fn<typeof fetch>();
const BrowserURL = URL;
const images: TestImage[] = [];
class TestImage {
  width = 1600; height = 1200; src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { images.push(this); }
}
const views = new Set<{ host: HTMLDivElement; root: Root }>();
const originalContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.user = { id: 'owner', organization_id: 'org', role: 'business_owner', status: 'active' };
  images.length = 0;
  requests.mockReset().mockImplementation(async (url, options) => Response.json(
    options?.method !== 'POST' ? { orders } : url === '/api/ai' ? { job: 'invoice-job' } : result,
  ));
  vi.stubGlobal('fetch', requests); vi.stubGlobal('Image', TestImage);
  vi.stubGlobal('URL', class extends BrowserURL {
    static createObjectURL = vi.fn(() => 'blob:fixture');
    static revokeObjectURL = vi.fn();
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ({ drawImage: vi.fn() }) });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,eA==');
});
afterEach(async () => {
  for (const view of views) { await act(() => view.root.unmount()); view.host.remove(); }
  views.clear(); Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalContext);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function mount() {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const view = { host, root }; views.add(view);
  await act(async () => { root.render(<InvoiceOrderReview enabled />); });
  return view;
}
async function choose(host: HTMLElement) {
  const select = host.querySelector('select')!;
  await act(() => { select.value = 'order'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  await act(() => {
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['fixture'], 'invoice.jpg', { type: 'image/jpeg' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function compare(host: HTMLElement) {
  const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent === 'Compare invoice');
  if (!button) throw new Error('Missing invoice comparison action');
  return button;
}
async function finishPhoto() { await act(async () => { images[0].onload?.(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

it('binds order reads, extraction and comparison to the captured Owner without receiving stock', async () => {
  const { host } = await mount(); await choose(host);
  await act(() => compare(host).click()); await finishPhoto();
  expect(requests).toHaveBeenCalledTimes(3);
  for (const [, options] of requests.mock.calls) expect(options?.headers).toMatchObject({
    'X-Track-Expected-Owner': 'owner', 'X-Track-Expected-Organization': 'org',
  });
  expect(requests.mock.calls[1][0]).toBe('/api/ai');
  expect(JSON.parse(String(requests.mock.calls[1][1]?.body))).toEqual({ action: 'invoice_image', image: 'data:image/jpeg;base64,eA==' });
  expect(requests.mock.calls[2][0]).toBe('/api/ai/purchase-order-match');
  expect(JSON.parse(String(requests.mock.calls[2][1]?.body))).toEqual({ job: 'invoice-job', order: 'order' });
  expect(host.textContent).toContain('This comparison does not receive stock');
  expect(host.textContent).toContain('Invoice line total');
});

it.each(['id', 'organization_id', 'role', 'status'] as const)('does not upload the selected invoice after current account %s changes during photo preparation', async field => {
  const { host } = await mount(); await choose(host); await act(() => compare(host).click());
  mock.user = { ...mock.user, [field]: field === 'role' ? 'cashier' : field === 'status' ? 'suspended' : 'other' };
  await finishPhoto();
  expect(requests).toHaveBeenCalledTimes(1);
});

it('does not compare or adopt extraction after an account switch while extraction is in flight', async () => {
  const extraction = deferred<Response>();
  requests.mockImplementation(async (url, options) => url === '/api/ai' ? extraction.promise
    : Response.json(options?.method === 'POST' ? result : { orders }));
  const { host } = await mount(); await choose(host); await act(() => compare(host).click()); await finishPhoto();
  expect(requests).toHaveBeenCalledTimes(2);
  mock.user = { ...mock.user, id: 'other-owner', organization_id: 'other-org' };
  await act(async () => { extraction.resolve(Response.json({ job: 'old-owner-job' })); });
  expect(requests).toHaveBeenCalledTimes(2); expect(host.textContent).not.toContain('Invoice line total');
});

it('resets invoice selections and previous results when another Owner opens the workspace', async () => {
  const { host, root } = await mount(); await choose(host); await act(() => compare(host).click()); await finishPhoto();
  expect(host.textContent).toContain('Invoice line total');
  mock.user = { ...mock.user, id: 'other-owner', organization_id: 'other-org' };
  await act(async () => { root.render(<InvoiceOrderReview enabled />); });
  expect(host.textContent).not.toContain('Invoice line total'); expect(host.querySelector('select')?.value).toBe('');
  expect(compare(host).disabled).toBe(true);
  expect(requests.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
    'X-Track-Expected-Owner': 'other-owner', 'X-Track-Expected-Organization': 'other-org',
  });
});
