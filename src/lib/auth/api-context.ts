import { createClient } from '@/lib/supabase/server';
import { withTimeout, AUTH_CHECK_TIMEOUT_MS } from '@/lib/utils/timeout';

export async function apiContext(roles = ['business_owner', 'admin']) {
  const db = await createClient();
  if (!db) throw new Error('Service unavailable');
  const { data: { user } } = await withTimeout(db.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);
  if (!user) throw new Error('Sign in required');
  const { data: profile } = await db.from('users').select('*').eq('id', user.id).single();
  if (!profile?.organization_id || profile.status !== 'active' || !roles.includes(profile.role)) throw new Error('Permission denied');
  return { db, profile, org: profile.organization_id };
}
