import { createClient } from '@/lib/supabase/server';
import { isMedicalIndustry } from '@/lib/industries';

/** Resolve industry from the signed-in business, never from request metadata. */
export async function medicalAccess() {
  const client = await createClient();
  if (!client) return { client: null, status: 401 } as const;
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { client: null, status: 401 } as const;
  const { data: profile } = await client.from('users').select('organization_id,status,role').eq('id', user.id).single();
  if (!profile?.organization_id || profile.status !== 'active' || !['business_owner','admin','cashier'].includes(profile.role)) return { client: null, status: 403 } as const;
  const { data: merchant } = await client.from('merchants').select('business_type').eq('organization_id', profile.organization_id).maybeSingle();
  if (!isMedicalIndustry(merchant?.business_type)) return { client: null, status: 403 } as const;
  return { client, status: 200 } as const;
}
