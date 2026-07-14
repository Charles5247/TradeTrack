/**
 * TradeTrack - Client-Side Audit Logging
 *
 * Writes audit entries via an API route (not directly to Supabase)
 * to avoid RLS 403 errors from the browser client.
 *
 * Falls back gracefully if the endpoint is unavailable.
 */

export interface AuditEntry {
  organization_id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  reason?: string;
}

/**
 * Log an audit entry from client-side code.
 * Uses the /api/audit route which uses the service role key.
 * Non-blocking: never throws — errors are silently logged.
 */
export async function createAuditEntry(entry: AuditEntry): Promise<void> {
  try {
    await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    // Audit logging should never break the main flow
    console.warn('[audit] Failed to write audit entry:', err);
  }
}
