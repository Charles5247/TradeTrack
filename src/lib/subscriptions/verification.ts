import { getDB } from '@/lib/offline/db';
import { isOffline } from '@/lib/utils/network';
import { withTimeout } from '@/lib/utils/timeout';

export const DAY = 86400000;
export interface Verification {
  id: string;
  active: boolean;
  verifiedAt: number;
  lastSeen: number;
  rollback?: boolean;
  trialEndsAt?: string | null;
  serverTime?: string;
  validUntil?: string | null;
  businessVerificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected' | string;
}

export function introductionDays(state: Verification | undefined, now = Date.now()) {
  if (!state?.trialEndsAt || !state.serverTime) return 0;
  const elapsed = Math.max(0, now - state.verifiedAt);
  const estimatedServerNow = Date.parse(state.serverTime) + elapsed;
  const remaining = Date.parse(state.trialEndsAt) - estimatedServerNow;
  return Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining / DAY)) : 0;
}

export function evaluateVerification(state: Verification | undefined, now: number) {
  if (!state) return { allowed: false, warning: false, message: 'Connect to the internet to verify your subscription before creating transactions.' };
  if (state.rollback || now < state.lastSeen - 120000) return { allowed: false, warning: false, message: 'Your device clock changed. Connect to verify your subscription again.' };
  if (!state.active) {
    const trialExpired = state.trialEndsAt && state.serverTime &&
      Date.parse(state.trialEndsAt) <= Date.parse(state.serverTime);
    return {
      allowed: false,
      warning: false,
      message: trialExpired
        ? 'Your free trial has ended. Your existing data remains available to view and export.'
        : 'Your subscription is inactive. Renew it before creating transactions.',
    };
  }
  const age = Math.max(0, now - state.verifiedAt);
  const estimatedServerNow = state.serverTime ? Date.parse(state.serverTime) + age : Number.NaN;
  const trialEnd = state.trialEndsAt ? Date.parse(state.trialEndsAt) : Number.NaN;
  if (Number.isFinite(trialEnd) && estimatedServerNow >= trialEnd &&
      (!state.validUntil || Date.parse(state.validUntil) <= trialEnd)) {
    return {
      allowed: false,
      warning: false,
      message: 'Your free trial has ended. Your existing data remains available to view and export.',
    };
  }
  if (state.validUntil && state.serverTime && Date.parse(state.serverTime) + age >= Date.parse(state.validUntil)) {
    return { allowed: false, warning: false, message: 'Your access period has ended. Choose a subscription to keep creating transactions.' };
  }
  return { allowed: age < 30 * DAY, warning: age >= 23 * DAY && age < 30 * DAY,
    message: age >= 30 * DAY ? 'Connect to verify your subscription. The 30-day offline window has ended.' : age >= 23 * DAY ? 'Connect soon to verify your subscription and keep creating transactions.' : '' };
}

export async function readVerification(org: string) {
  const db = await getDB();
  const tx = db.transaction('app_meta', 'readwrite');
  const state = await tx.store.get(`subscription:${org}`) as Verification | undefined;
  if (state) {
    const now = Date.now();
    state.rollback = state.rollback || now < state.lastSeen - 120000;
    state.lastSeen = Math.max(state.lastSeen, now);
    await tx.store.put(state);
  }
  await tx.done;
  return state;
}

export async function verifySubscription(org: string) {
  if (!org) throw new Error('Your account is not linked to a business.');
  if (isOffline()) return readVerification(org);
  try {
    const response = await withTimeout(fetch('/api/subscriptions/verification', { cache: 'no-store' }), 3000);
    if (!response.ok) throw new Error('Subscription verification unavailable');
    const result = await response.json();
    if (result.organization_id !== org || typeof result.active !== 'boolean') throw new Error('Invalid verification response');
    const now = Date.now();
    const state: Verification = {
      id: `subscription:${org}`,
      active: result.active,
      verifiedAt: now,
      lastSeen: now,
      rollback: false,
      trialEndsAt: result.trial_ends_at,
      serverTime: result.server_time,
      validUntil: result.valid_until,
      businessVerificationStatus: result.business_verification_status,
    };
    await (await getDB()).put('app_meta', state);
    return state;
  } catch {
    return readVerification(org);
  }
}

export async function requireTransactionSubscription(org: string) {
  if (!org) throw new Error('Your account is not linked to a business.');
  const state = await readVerification(org);
  const decision = evaluateVerification(state, Date.now());
  if (!decision.allowed) throw new Error(decision.message);
}

// The POS keeps its existing synchronous checkout body and error presentation.
// Verification is hydrated by the shared banner; the guard never makes checkout
// wait on a network request.
export async function allowCheckout(org: string, notify: (message: string) => void) {
  try { await requireTransactionSubscription(org); return true; }
  catch (error) { notify(error instanceof Error ? error.message : 'Subscription verification required.'); return false; }
}
