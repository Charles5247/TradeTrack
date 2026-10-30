import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { paymentAdmin } from '@/lib/subscriptions/zainpay-checkout';
import { configuredSmsProvider } from '@/lib/notifications/sms-provider';

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = paymentAdmin();
  const { error: reminderError } = await admin.rpc('generate_scheduled_notifications');
  if (reminderError) console.warn('[notifications] scheduled reminder generation unavailable', { reason: reminderError.message });
  const { data: jobs, error } = await admin.from('notification_delivery_outbox').select('id,notification_id,channel,attempts').in('status', ['pending','failed']).lt('attempts', 5).order('created_at').limit(100);
  if (error) return NextResponse.json({ error: 'Outbox unavailable' }, { status: 503 });
  let sent = 0;
  let skipped = 0;
  for (const job of jobs || []) {
    let smsCharged = false;
    const { data: notification } = await admin.from('notifications').select('id,user_id,title,body,message').eq('id', job.notification_id).maybeSingle();
    const { data: recipient } = notification?.user_id ? await admin.from('users').select('email,phone').eq('id', notification.user_id).maybeSingle() : { data: null };
    try {
      if (job.channel === 'email') {
        if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM || !recipient?.email) throw new Error('Resend sender/domain or recipient email is not configured');
        const response = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: process.env.RESEND_FROM, to: recipient.email, subject: notification?.title || 'TracKasuwa notification', text: notification?.body || notification?.message || '' });
        if (response.error) throw new Error(response.error.message);
      } else {
        const provider = configuredSmsProvider();
        if (!provider || !recipient?.phone) throw new Error('SMS provider is not configured');
        const { data: charged } = await admin.rpc('consume_sms_credit', { p_notification_id: job.notification_id });
        if (!charged) throw new Error('SMS credit balance is zero');
        smsCharged = true;
        await provider.send({ to: recipient.phone, body: notification?.body || notification?.message || '', idempotencyKey: job.id });
      }
      await admin.from('notification_delivery_outbox').update({ status: 'sent', attempts: job.attempts + 1, sent_at: new Date().toISOString(), last_error: null }).eq('id', job.id);
      sent += 1;
    } catch (deliveryError) {
      if (smsCharged) await admin.rpc('refund_sms_credit', { p_notification_id: job.notification_id });
      const message = deliveryError instanceof Error ? deliveryError.message : 'Delivery failed';
      const configurationIssue = /not configured|domain|balance is zero/i.test(message);
      await admin.from('notification_delivery_outbox').update({ status: configurationIssue ? 'skipped' : 'failed', attempts: job.attempts + 1, last_error: message }).eq('id', job.id);
      console.warn('[notifications] delivery unavailable', { channel: job.channel, notificationId: job.notification_id, reason: message });
      skipped += 1;
    }
  }
  return NextResponse.json({ processed: jobs?.length || 0, sent, skipped });
}
