import 'server-only';
import type { DeliveryAdapter } from './types';
import { withTimeout } from '@/lib/utils/timeout';
export function deliveryAdapter(channel: 'email' | 'sms'): DeliveryAdapter {
  const prefix=channel === 'email' ? 'AI_EMAIL' : 'AI_SMS';
  const url=process.env[`${prefix}_URL`]; const key=process.env[`${prefix}_KEY`];
  return {
    enabled: Boolean(url && key),
    async send(input) {
      if (!url || !key) throw new Error(`${channel} delivery is disabled.`);
      if (!url.startsWith('https://')) throw new Error('Delivery adapter URLs must use HTTPS.');
      const response=await withTimeout(fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,'Idempotency-Key':input.idempotencyKey},body:JSON.stringify(input)}),10000);
      if (!response.ok) throw new Error(`${channel} delivery failed.`);
    },
  };
}
