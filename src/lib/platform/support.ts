import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

export function platformDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Platform service unavailable');
  return createServiceClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function notifyPlatformOwners(title: string, message: string, caseId: string) {
  const admin = platformDb();
  const { data: owners, error } = await admin.from('users').select('id').eq('role', 'platform_owner').eq('status', 'active');
  if (error) throw error;
  if (!owners?.length) throw new Error('No active platform owner can receive this alert');
  const { error: notificationError } = await admin.from('notifications').insert(owners.map(owner => ({
    organization_id: null, user_id: owner.id, type: 'support_case', title, message,
    body: message, severity: 'warning', entity_type: 'support_case', entity_id: caseId,
    data: { href: '/admin/support' },
  })));
  if (notificationError) throw notificationError;
}

export async function notifyMerchantOwners(organizationId: string, title: string, message: string, caseId?: string) {
  const admin = platformDb();
  const { data: owners, error } = await admin.from('users').select('id').eq('organization_id', organizationId)
    .in('role', ['business_owner', 'admin']).eq('status', 'active');
  if (error) throw error;
  if (!owners?.length) throw new Error('No active merchant owner can receive this message');
  const { error: notificationError } = await admin.from('notifications').insert(owners.map(owner => ({
    organization_id: organizationId, user_id: owner.id, type: caseId ? 'support_reply' : 'platform_message',
    title, message, body: message, severity: 'info',
    entity_type: caseId ? 'support_case' : null, entity_id: caseId || null,
    data: { href: caseId ? '/support' : '/notifications' },
  })));
  if (notificationError) throw notificationError;
}
