'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { useCopy } from '@/i18n/text';

const subscribe = () => () => {};
const serverSearch = () => '';
const browserSearch = () => window.location.search;

export function PaymentReturn() {
  const copy = useCopy();
  const search = useSyncExternalStore(subscribe, browserSearch, serverSearch);
  const reference = new URLSearchParams(search).get('reference');
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('Checking your payment. Do not pay again.');
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({txnRef:reference}) })
      .then(async response => {
        const result = await response.json();
        if (cancelled) return;
        if (response.ok && result.subscriptionActivated) {
          setMessage('Payment confirmed. Your subscription is active.');
          setComplete(true);
        } else {
          setMessage(result.sandbox ? 'Sandbox payment verified. Paid access was not activated.' : 'Payment is still being checked. Retry verification before making another payment.');
        }
      }).catch(() => { if (!cancelled) setMessage('Payment is still being checked. Retry verification before making another payment.'); });
    return () => { cancelled = true; };
  }, [reference, attempt]);
  if (!reference) return null;
  return <div role="status" className="rounded-xl border p-4 space-y-3">
    <p>{copy(message)}</p>
    {complete ? <Button onClick={() => window.location.assign('/subscriptions')}>{copy('Refresh subscription')}</Button> : <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{copy('Check payment again')}</Button>}
  </div>;
}
