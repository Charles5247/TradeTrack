// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOfflineAuthSession,
  getOfflineAuthSession,
  saveOfflineAuthSession,
  saveRememberedLogin,
  verifyRememberedLogin,
} from '../auth-cache';

describe('offline auth cache', () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('stores and restores a valid offline session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));

    saveOfflineAuthSession('owner@demo.com', { id: 'user-1', role: 'owner' });

    expect(getOfflineAuthSession()).toMatchObject({
      email: 'owner@demo.com',
      profile: { id: 'user-1', role: 'owner' },
    });
  });

  it('rejects remembered logins that are past the 30-day expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));

    await saveRememberedLogin('admin@demo.com', 'demo1234', { id: 'user-2', role: 'admin' });

    vi.setSystemTime(new Date('2026-08-27T12:00:01.000Z'));

    await expect(verifyRememberedLogin('admin@demo.com', 'demo1234')).resolves.toBeNull();
  });

  it('clears the offline session cache', () => {
    saveOfflineAuthSession('cashier@demo.com', { id: 'user-3', role: 'cashier' });
    clearOfflineAuthSession();

    expect(getOfflineAuthSession()).toBeNull();
  });
});
