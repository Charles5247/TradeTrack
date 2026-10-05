'use client';
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store';
import { introductionDays, evaluateVerification, verifySubscription, type Verification } from '@/lib/subscriptions/verification';

export function VerificationBanner() {
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
  if (decision.allowed && !decision.warning && !trialDays) return null;
  return <div role="status" className="border-b bg-[color-mix(in_oklch,var(--c-warn),transparent_90%)] px-4 py-2 text-sm text-[var(--c-warn)]">{verificationError || decision.message}{trialDays > 0 && ` Introductory period: ${trialDays} days remaining at the last server verification.`}</div>;
}
