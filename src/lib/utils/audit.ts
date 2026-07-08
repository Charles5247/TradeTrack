import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

interface AuditEntry {
  organization_id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  reason?: string;
}

export async function createAuditLog(entry: AuditEntry) {
  const supabase = await createClient();
  const headersList = await headers();

  const ip = headersList.get('x-forwarded-for') ||
              headersList.get('x-real-ip') ||
              '127.0.0.1';
  const userAgent = headersList.get('user-agent') || '';

  await supabase.from('audit_logs').insert({
    ...entry,
    ip_address: ip.split(',')[0].trim(),
    user_agent: userAgent,
  });
}

export async function logActivity(
  organization_id: string,
  user_id: string,
  activity_type: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  const supabase = await createClient();
  await supabase.from('activity_logs').insert({
    organization_id,
    user_id,
    activity_type,
    description,
    metadata: metadata || {},
  });
}
