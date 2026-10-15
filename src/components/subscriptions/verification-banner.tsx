'use client';
import { useCopy } from '@/i18n/text';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store';
import { introductionDays, evaluateVerification, verifySubscription, type Verification } from '@/lib/subscriptions/verification';

export function VerificationBanner() {
  const copy = useCopy();
  const org = useAuthStore(s => s.user?.organization_id);
  const [state, setState] = useState<Verification>();
  const [verificationError, setVerificationError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    setState(undefined);
    setVerificationError(null);
    const refresh = async () => {
      if (!org) return;
      try {
        const next = await verifySubscription(org);
        if (!disposed) {
          setState(next);
          setVerificationError(null);
        }
      } catch {
        if (!disposed) {
          setState(undefined);
          setVerificationError('Subscription verification is temporarily unavailable on this device. Retrying automatically.');
        }
      }
    };
    void refresh();
    window.addEventListener('online', refresh);
    const interval = setInterval(refresh, 60000);
    return () => { disposed = true; clearInterval(interval); window.removeEventListener('online', refresh); };
  }, [org]);
  if (!org) return null;
  const decision = evaluateVerification(state, Date.now());
  const trialDays = introductionDays(state);
  const verificationStatus = state?.businessVerificationStatus ?? 'unverified';
  const verificationRequired = Boolean(
    state && !decision.allowed && !state.trialEndsAt && verificationStatus !== 'verified',
  );
  if (decision.allowed && !decision.warning && !trialDays && !verificationRequired) return null;
  const paymentRequired = Boolean(
    state && verificationStatus === 'verified' && !state.rollback && !decision.allowed,
  );
  const verificationMessage = verificationStatus === 'pending'
    ? 'Business details submitted. Your trial will begin after platform verification.'
    : verificationStatus === 'rejected'
      ? 'Verification was not approved. Update your business details and submit them again.'
      : 'Complete business details and submit your registration for review to start the 30-day Business trial.';
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-[color-mix(in_oklch,var(--c-warn),transparent_90%)] px-4 py-2 text-sm text-[var(--c-warn)]">
      <span>{verificationRequired ? copy(verificationMessage) : verificationError || copy(decision.message)}</span>
      {trialDays > 0 && <span>{copy('Free trial: {days} days remaining.', { days: trialDays })}</span>}
      {verificationRequired && <Link href="/settings" className="font-semibold underline underline-offset-2">{copy('Submit business details')}</Link>}
      {paymentRequired && <Link href="/subscriptions" className="font-semibold underline underline-offset-2">{copy('Choose a plan to create new transactions.')}</Link>}
    </div>
  );
}
