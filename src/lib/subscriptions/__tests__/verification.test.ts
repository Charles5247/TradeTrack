// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { DAY, introductionDays, evaluateVerification, readVerification, requireTransactionSubscription, verifySubscription } from '../verification';
import { getDB } from '@/lib/offline/db';
const now = Date.now();
const active = { id: 'subscription:org', active: true, verifiedAt: now, lastSeen: now };
it('uses server time for the introductory countdown', () => {
  expect(introductionDays({ ...active, serverTime: '2026-01-01T00:00:00Z', trialEndsAt: '2026-01-31T00:00:00Z' })).toBe(30);
  expect(introductionDays({ ...active, trialEndsAt: '2099-01-01' })).toBe(0);
});
it('gives fresh devices no grace', () => expect(evaluateVerification(undefined, now).allowed).toBe(false));
it.each([0, 22, 23, 29, 30, 31])('enforces day %s', (days) => {
  expect(evaluateVerification(active, now + days * DAY)).toMatchObject({ allowed: days < 30, warning: days >= 23 && days < 30 });
});
it('blocks inactive and rolled-back clocks', () => {
  expect(evaluateVerification({ ...active, active: false }, now).allowed).toBe(false);
  expect(evaluateVerification(active, now - 120001).allowed).toBe(false);
});
it('persists rollback until a server confirmation', async () => {
  await (await getDB()).put('app_meta', { ...active, lastSeen: now + DAY });
  expect((await readVerification('org'))?.rollback).toBe(true);
  await expect(requireTransactionSubscription('org')).rejects.toThrow('clock');
});
it('records server-confirmed inactivity and isolates organizations', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ organization_id: 'org', active: false })));
  expect((await verifySubscription('org'))?.active).toBe(false);
  await expect(requireTransactionSubscription('org')).rejects.toThrow('inactive');
  await expect(requireTransactionSubscription('other')).rejects.toThrow('verify');
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
