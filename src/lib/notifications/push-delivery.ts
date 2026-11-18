import webpush from 'web-push';
import { paymentAdmin } from '@/lib/subscriptions/zainpay-checkout';

export async function deliverPushJobs() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  if (!publicKey || !privateKey || !subject) return { sent: 0, skipped: 'not_configured' };
  const admin = paymentAdmin();
  const { data: ready, error } = await admin.from('notification_push_outbox')
    .select('id,notification_id,subscription_id,status,attempts')
    .in('status', ['pending', 'failed']).lt('attempts', 5).order('created_at').limit(50);
  if (error) throw new Error('Push outbox unavailable');
  const { data: abandoned, error: abandonedError } = await admin.from('notification_push_outbox')
    .select('id,notification_id,subscription_id,status,attempts')
    .eq('status', 'sending').lt('attempts', 5)
    .lt('claimed_at', new Date(Date.now() - 2 * 60_000).toISOString())
    .order('created_at').limit(50);
  if (abandonedError) throw new Error('Push outbox recovery unavailable');
  const jobs = [...(ready || []), ...(abandoned || [])].slice(0, 50);
  let sent = 0;
  for (const job of jobs) {
    const { data: claim } = await admin.from('notification_push_outbox')
      .update({ status: 'sending', attempts: job.attempts + 1, claimed_at: new Date().toISOString() })
      .eq('id', job.id).eq('status', job.status).eq('attempts', job.attempts).select('id').maybeSingle();
    if (!claim) continue;
    try {
      const [{ data: notification }, { data: subscription }] = await Promise.all([
        admin.from('notifications').select('id,user_id,organization_id,title,message,body,in_app_visible').eq('id', job.notification_id).maybeSingle(),
        admin.from('notification_push_subscriptions').select('id,user_id,organization_id,endpoint,p256dh,auth_secret').eq('id', job.subscription_id).maybeSingle(),
      ]);
      if (!notification || !subscription || !notification.in_app_visible || notification.user_id !== subscription.user_id || notification.organization_id !== subscription.organization_id)
        throw new Error('Notification recipient changed');
      const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', subscription.user_id).eq('is_read', false).eq('in_app_visible', true);
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } },
        JSON.stringify({ id: notification.id, title: notification.title || 'Trackasuwa notification',
          body: notification.body || notification.message || '', badgeCount: count ?? 0, href: '/notifications' }),
        { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600, timeout: 10000 });
      await admin.from('notification_push_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', job.id);
      sent++;
    } catch (cause) {
      const statusCode = typeof cause === 'object' && cause && 'statusCode' in cause ? Number(cause.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('notification_push_subscriptions').delete().eq('id', job.subscription_id);
        continue;
      }
      const message = cause instanceof Error ? cause.message : 'Push delivery failed';
      await admin.from('notification_push_outbox').update({ status: 'failed', last_error: message.slice(0, 500) }).eq('id', job.id);
      console.warn('[notifications] push delivery unavailable', { jobId: job.id, statusCode });
    }
  }
  return { sent };
}
