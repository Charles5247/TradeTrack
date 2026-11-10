// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ role: 'business_owner', pathname: '/inventory' }));
vi.mock('@/store', () => ({ useAuthStore: (pick: (value: { user: { role: string } }) => unknown) => pick({ user: { role: state.role } }) }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/i18n/text', () => ({ useCopy: () => (value: string) => value }));
import { AssistantLauncher } from './assistant-launcher';

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
    expect(host.querySelector('a[href="/assistant#inventory"]')).not.toBeNull();
    expect(host.querySelector('button[aria-expanded]')?.className).toContain('size-12');
    state.pathname = '/pos';
    await act(() => root.render(<AssistantLauncher />));
    expect(host.querySelector('div')?.className).toContain('hidden lg:flex');
  } finally { await act(() => root.unmount()); }
});
