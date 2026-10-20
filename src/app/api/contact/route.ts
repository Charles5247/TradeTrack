import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { BUSINESS } from '@/lib/business-config';

const schema = z.object({
  name: z.string().trim().min(2).max(150),
  business_name: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(7).max(30),
  message: z.string().trim().min(5).max(5000),
});
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Please check the form fields.' }, { status: 400 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: 'Please contact us on WhatsApp.' }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const { data, error } = await db.from('contact_messages').insert(parsed.data).select('id').single();
  if (error) {
    console.error('[contact] save failed', error.code);
    return NextResponse.json({ error: 'Please contact us on WhatsApp.' }, { status: 503 });
  }
  // Database storage is durable even when email delivery is unavailable.
  // Pending rows remain visible to the platform owner for follow-up.
  if (process.env.RESEND_API_KEY && process.env.CONTACT_EMAIL_FROM) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.CONTACT_EMAIL_FROM, to: [BUSINESS.email], subject: 'TracKasuwa contact request', text: Object.entries(parsed.data).map(([k,v]) => `${k}: ${v}`).join('\n') }),
      });
      if (response.ok) await db.from('contact_messages').update({ email_status: 'sent' }).eq('id', data.id);
    } catch { /* Keep the durable pending delivery for owner follow-up. */ }
  }
  return NextResponse.json({ saved: true }, { status: 201 });
}
