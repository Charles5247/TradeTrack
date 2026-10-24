// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOfflineAuthSession,
  getOfflineAuthSession,
  saveOfflineAuthSession,
  saveRememberedLogin,
  verifyRememberedLogin,
  restoreRememberedLogin,
} from '../auth-cache';

describe('offline auth cache', () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('stores and restores a valid offline session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));

    saveOfflineAuthSession('owner@demo.com', { id: 'user-1', role: 'business_owner', status: 'active' });

    expect(getOfflineAuthSession()).toMatchObject({
      email: 'owner@demo.com',
      profile: { id: 'user-1', role: 'business_owner' },
    });
  });

  it('rejects remembered logins that are past the 30-day expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));

    await saveRememberedLogin('admin@demo.com', 'demo1234', { id: 'user-2', role: 'admin', status:'active' });

    vi.setSystemTime(new Date('2026-08-27T12:00:01.000Z'));

    await expect(verifyRememberedLogin('admin@demo.com', 'demo1234')).resolves.toBeNull();
  });

  it('clears the offline session cache', () => {
    saveOfflineAuthSession('cashier@demo.com', { id: 'user-3', role: 'cashier' });
    clearOfflineAuthSession();

    expect(getOfflineAuthSession()).toBeNull();
  });

  it('bounds offline access to the existing 30-day window without renewing verification offline',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    await saveRememberedLogin('owner@test.invalid','password',{id:'owner',role:'business_owner',status:'active'});
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    expect(await restoreRememberedLogin('owner@test.invalid','password')).toBeTruthy();
    expect(getOfflineAuthSession()?.createdAt).toBe('2026-10-19T12:00:00.000Z');
    vi.setSystemTime(new Date('2026-11-18T12:00:01Z'));
    expect(getOfflineAuthSession()).toBeNull();
    expect(await restoreRememberedLogin('owner@test.invalid','password')).toBeNull();
  });

  it('rejects suspended, malformed and future-dated cached profiles',()=>{
    saveOfflineAuthSession('x@test.invalid',{id:'x',status:'suspended'});expect(getOfflineAuthSession()).toBeNull();
    saveOfflineAuthSession('x@test.invalid',{id:'x',status:'active'},'invalid');expect(getOfflineAuthSession()).toBeNull();
    saveOfflineAuthSession('x@test.invalid',{id:'x',status:'active'},new Date(Date.now()+600000).toISOString());expect(getOfflineAuthSession()).toBeNull();
  });
});
