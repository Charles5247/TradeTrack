// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const { announce, setUnreadCount } = vi.hoisted(() => ({ announce: vi.fn(), setUnreadCount: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: announce } }));
vi.mock('@/store', () => ({
  useAuthStore: (selector: (state: { user: { id: string; role: string; organization_id: string } }) => unknown) => selector({ user: { id: 'staff-1', role: 'cashier', organization_id: 'org-1' } }),
  useNotificationStore: (selector: (state: { setUnreadCount: typeof setUnreadCount }) => unknown) => selector({ setUnreadCount }),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ count: 2, error: null }) }) }) }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: async () => undefined,
}) }));
import { NotificationSync } from './notification-sync';

it('shows unread notifications when staff enter the dashboard', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<NotificationSync />); });
    expect(setUnreadCount).toHaveBeenCalledWith(2);
    expect(announce).toHaveBeenCalledWith('You have 2 unread notifications.', expect.objectContaining({ action: expect.objectContaining({ label: 'View' }) }));
  } finally { await act(async () => root.unmount()); }
});
