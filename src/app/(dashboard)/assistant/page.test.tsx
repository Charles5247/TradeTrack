// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StockReviewDraft } from '@/lib/ai/stock-review-draft';

const mock = vi.hoisted(() => ({
  user: { id: 'owner', organization_id: 'org', role: 'business_owner', status: 'active' },
  load: vi.fn(), create: vi.fn(), clear: vi.fn(), fetch: vi.fn(),
}));
vi.mock('@/store', () => ({ useAuthStore: Object.assign(
  (pick: (state: { user: typeof mock.user }) => unknown) => pick({ user: mock.user }),
  { getState: () => ({ user: mock.user }) },
) }));
vi.mock('@/lib/ai/stock-review-draft', () => ({ loadStockReview: mock.load, createStockReview: mock.create, clearStockReview: mock.clear, resumeLegacyStockReview: async () => null }));
vi.mock('@/components/shared/access-guard', () => ({ AccessGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/ai/stock-receiving-review', () => ({ StockReceivingReview: ({ job }: { job: string }) => <section aria-label="Recovered review">{job}</section> }));
vi.mock('@/i18n/text', () => ({ useCopy: () => (text: string) => text, TranslatedText: ({ text }: { text: string }) => text }));
import AssistantPage from './page';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const saved: StockReviewDraft = {
  version: 1, revision: 1, ownerId: 'owner', organizationId: 'org', job: 'saved-job',
  sourceRows: [{ name: 'Rice', opening_stock: 4, cost_price: 100 }], rows: null,
};
const button = (label: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent === label)!;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.user = { id: 'owner', organization_id: 'org', role: 'business_owner', status: 'active' };
  mock.load.mockReset().mockResolvedValue(null);
  mock.create.mockReset().mockResolvedValue(saved);
  mock.clear.mockReset().mockResolvedValue(undefined);
  mock.fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ stub: true, channels: { in_app: true, email: false, sms: false }, preferences: { in_app: false, email: false, sms: false } })));
  vi.stubGlobal('fetch', mock.fetch);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('reopens the saved review and prevents a new delivery from replacing it', async () => {
  mock.load.mockResolvedValue(saved);
  await act(async () => root.render(<AssistantPage />));
  expect(mock.load).toHaveBeenCalledWith({ ownerId: 'owner', organizationId: 'org' });
  expect(host.querySelector('[aria-label="Recovered review"]')?.textContent).toBe('saved-job');
  expect(host.querySelector<HTMLFieldSetElement>('#inventory')?.disabled).toBe(true);
  expect(mock.create).not.toHaveBeenCalled();
});

it('keeps the review open when a pending receipt prevents closing it', async () => {
  mock.load.mockResolvedValue(saved);
  mock.clear.mockRejectedValue(new Error('Confirm pending receipts before closing this review.'));
  await act(async () => root.render(<AssistantPage />));
  await act(async () => button('Close this review').click());
  expect(host.textContent).toContain('Confirm pending receipts before closing this review.');
  expect(host.querySelector('[aria-label="Recovered review"]')).not.toBeNull();
  expect(host.querySelector<HTMLFieldSetElement>('#inventory')?.disabled).toBe(true);
});

it('cannot close a newer job that replaced the review in another tab', async () => {
  mock.load.mockResolvedValueOnce(saved).mockResolvedValueOnce({ ...saved, job: 'newer-job' });
  await act(async () => root.render(<AssistantPage />));
  await act(async () => button('Close this review').click());
  expect(mock.clear).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Another stock review is now active');
});

it('fails closed when saved reviews cannot be read, and offers recovery', async () => {
  mock.load.mockRejectedValueOnce(new Error('Storage unavailable'));
  await act(async () => root.render(<AssistantPage />));
  expect(host.textContent).toContain('Storage unavailable');
  expect(host.querySelector<HTMLFieldSetElement>('#inventory')?.disabled).toBe(true);
  await act(async () => button('Try opening saved review again').click());
  expect(host.querySelector<HTMLFieldSetElement>('#inventory')?.disabled).toBe(false);
});

it('ignores a late generated proposal after the Owner changes in the same organisation', async () => {
  let respond!: (response: Response) => void;
  await act(async () => root.render(<AssistantPage />));
  mock.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve; }));
  await act(() => button('Propose mapped rows').click());
  mock.user = { ...mock.user, id: 'other-owner' };
  await act(async () => root.render(<AssistantPage />));
  await act(async () => respond(new Response(JSON.stringify({ job: 'old-owner-job', rows: [{ name: 'Rice' }] }))));
  expect(mock.create).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="Recovered review"]')).toBeNull();
});

it('persists a generated proposal before opening its review', async () => {
  await act(async () => root.render(<AssistantPage />));
  mock.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ job: 'saved-job', rows: saved.sourceRows })));
  await act(async () => button('Propose mapped rows').click());
  expect(mock.create).toHaveBeenCalledWith({ ownerId: 'owner', organizationId: 'org' }, 'saved-job', saved.sourceRows);
  expect(host.querySelector('[aria-label="Recovered review"]')?.textContent).toBe('saved-job');
  expect(host.querySelector<HTMLFieldSetElement>('#inventory')?.disabled).toBe(true);
});
