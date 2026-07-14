import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import type { Database } from '@/lib/supabase/types';

type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert'];
type ActivityLogInsert = Database['public']['Tables']['activity_logs']['Insert'];

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
  try {
    const supabase = await createClient();
    const headersList = await headers();

    const ip =
      headersList.get('x-forwarded-for') ||
      headersList.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = headersList.get('user-agent') || '';

    const record: AuditLogInsert = {
      organization_id: entry.organization_id,
      user_id: entry.user_id,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      old_values: entry.old_values,
      new_values: entry.new_values,
      reason: entry.reason,
      ip_address: ip.split(',')[0].trim(),
      user_agent: userAgent,
    };

    await supabase.from('audit_logs').insert(record);
  } catch {
    // Audit failures should not crash the app
  }
}

export async function logActivity(
  organization_id: string,
  user_id: string,
  activity_type: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  try {
    const supabase = await createClient();
    const record: ActivityLogInsert = {
      organization_id,
      user_id,
      activity_type,
      description,
      metadata: metadata || {},
    };
    await supabase.from('activity_logs').insert(record);
  } catch {
    // Ignore
  }
}
