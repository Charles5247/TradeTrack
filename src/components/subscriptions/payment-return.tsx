'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { useCopy } from '@/i18n/text';
import { createClient } from '@/lib/supabase/client';

const subscribe = () => () => {};
const serverSearch = () => '';
const browserSearch = () => window.location.search;

export function PaymentReturn() {
  const copy = useCopy();
  const search = useSyncExternalStore(subscribe, browserSearch, serverSearch);
  const urlReference = new URLSearchParams(search).get('reference');
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const reference = urlReference || pendingReference;
  const renewalUnavailable = new URLSearchParams(search).get('renewal') === 'unavailable';
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('Checking your payment. Do not pay again.');
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (urlReference) return;
    let cancelled = false;
    createClient().auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const response = await fetch('/api/payments/pending', {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      if (!response.ok || cancelled) return;
      const result: { checkout?: { reference: string } | null } = await response.json();
      if (!cancelled) setPendingReference(result.checkout?.reference || null);
    }).catch(() => { /* The subscription page remains usable while offline. */ });
    return () => { cancelled = true; };
  }, [urlReference]);
  useEffect(() => {
    if (!reference || !urlReference && attempt === 0) return;
    let cancelled = false;
    fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({txnRef:reference}) })
      .then(async response => {
        const result = await response.json();
        if (cancelled) return;
        if (response.ok && result.subscriptionActivated) {
          setMessage(renewalUnavailable
            ? 'Payment confirmed. Your subscription is active. Automatic renewal was not enabled because the payment provider did not supply a reusable card authorization. Future renewal remains manual.'
            : 'Payment confirmed. Your subscription is active.');
          setComplete(true);
        } else {
          setMessage(result.sandbox ? 'Sandbox payment verified. Paid access was not activated.' : 'Payment is still being checked. Retry verification before making another payment.');
        }
      }).catch(() => { if (!cancelled) setMessage('Payment is still being checked. Retry verification before making another payment.'); });
    return () => { cancelled = true; };
  }, [reference, urlReference, attempt, renewalUnavailable]);
  if (!reference) return null;
  return <div role="status" className="rounded-xl border p-4 space-y-3">
    <p>{copy(pendingReference && !urlReference && attempt === 0 ? 'You have a pending subscription payment. Check it before paying again.' : message)}</p>
    {complete ? <Button onClick={() => window.location.assign('/subscriptions')}>{copy('Refresh subscription')}</Button> : <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{copy('Check payment again')}</Button>}
  </div>;
}
