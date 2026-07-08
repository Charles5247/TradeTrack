'use client';

import { createClient } from '@/lib/supabase/client';

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

export async function createAuditEntry(entry: AuditEntry) {
  const supabase = createClient();
  await supabase.from('audit_logs').insert({
    ...entry,
    ip_address: null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
}
