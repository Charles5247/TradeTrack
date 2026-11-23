// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ role: 'business_owner', pathname: '/inventory', id: 'owner', organization_id: 'org', status: 'active', load: vi.fn(), create: vi.fn() }));
vi.mock('@/store', () => ({ useAuthStore: Object.assign(
  (pick: (value: { user: typeof state }) => unknown) => pick({ user: state }), { getState: () => ({ user: state }) },
) }));
vi.mock('@/lib/ai/stock-review-draft', () => ({ loadStockReview: state.load, createStockReview: state.create }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/i18n/text', () => ({ useCopy: () => (value: string) => value }));
import { AssistantLauncher } from './assistant-launcher';

beforeEach(() => {
  Object.assign(state, { role: 'business_owner', pathname: '/inventory', id: 'owner', organization_id: 'org', status: 'active' });
  state.load.mockReset(); state.create.mockReset(); window.localStorage.clear();
});

it('keeps the saved review link available offline and restores launcher focus on Escape', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() => root.render(<AssistantLauncher />));
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    await act(() => trigger.click());
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close assistant');
    const draftLink = host.querySelector('a[href="/assistant#inventory"]');
    expect(draftLink?.textContent).toBe('Open a saved stock review');
    expect(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Prepare and review stock')?.disabled).toBe(true);
    expect(state.load).not.toHaveBeenCalled();
    await act(() => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  } finally { await act(() => root.unmount()); host.remove(); online.mockRestore(); }
});

it('opens a contextual floating assistant for the owner only', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    state.role = 'admin';
    await act(() => root.render(<AssistantLauncher />));
    expect(host.querySelector('button')).toBeNull();
    state.role = 'business_owner';
    await act(() => root.render(<AssistantLauncher />));
    await act(() => host.querySelector('button')!.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Prepare stock from this area');
    expect(host.querySelector('textarea[aria-label="Paste a stock list"]')).not.toBeNull();
    expect(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Prepare and review stock')?.hasAttribute('disabled')).toBe(true);
    expect(host.querySelector('a[href="/assistant#inventory"]')).not.toBeNull();
    expect(host.querySelector('button[aria-expanded]')?.className).toContain('size-12');
    state.pathname = '/pos';
    await act(() => root.render(<AssistantLauncher />));
    expect(host.querySelector('div')?.className).toContain('hidden lg:flex');
  } finally { await act(() => root.unmount()); }
});

it('keeps an existing review and does not generate another job from the launcher', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.role = 'business_owner'; state.pathname = '/inventory'; state.load.mockResolvedValue({ job: 'existing-job' });
  const request = vi.fn(); vi.stubGlobal('fetch', request);
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(() => root.render(<AssistantLauncher />));
    await act(() => host.querySelector('button')!.click());
    const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Rice 4'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Prepare and review stock')!.click());
    expect(state.load).toHaveBeenCalledWith({ ownerId: 'owner', organizationId: 'org' });
    expect(request).not.toHaveBeenCalled();
    expect(host.textContent).toContain('An unfinished stock review is already open');
    expect(input.value).toBe('Rice 4');
  } finally { await act(() => root.unmount()); vi.unstubAllGlobals(); }
});

it.each(['role', 'status'] as const)('does not adopt a generated job after the current Owner %s changes', async field => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.load.mockResolvedValue(null);
  const request = vi.fn<typeof fetch>(async () => {
    state[field] = field === 'role' ? 'cashier' : 'suspended';
    return Response.json({ job: 'old-owner-job', rows: [{ name: 'Rice' }] });
  });
  vi.stubGlobal('fetch', request);
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(() => root.render(<AssistantLauncher />));
    await act(() => host.querySelector('button')!.click());
    const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Rice 4'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Prepare and review stock')!.click());
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]).toMatchObject({ headers: {
      'X-Track-Expected-Owner': 'owner', 'X-Track-Expected-Organization': 'org',
    } });
    expect(window.localStorage.getItem('trackasuwa.ai.stockJob')).toBeNull();
  } finally { await act(() => root.unmount()); vi.unstubAllGlobals(); }
});
