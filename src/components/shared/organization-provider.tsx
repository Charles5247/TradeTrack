'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { setAppCurrency, setAppDateFormat } from '@/lib/utils/format';
import type { Organization } from '@/types';

interface OrganizationContextValue {
  organization: Organization | null;
  industry: string | null;
  isLoading: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue>({
  organization: null,
  industry: null,
  isLoading: true,
});

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadOrganization() {
      if (!user?.organization_id) {
        setIndustry(null);
        setOrganization(null);
        setAppCurrency('NGN');
        setAppDateFormat('medium');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setIndustry(null);
      try {
        const supabase = createClient();
        const [{ data }, {data: merchant}] = await Promise.all([supabase
          .from('organizations')
          .select('*')
          .eq('id', user.organization_id)
          .single(), supabase.from('merchants').select('business_type').eq('organization_id', user.organization_id).maybeSingle()]);

        if (cancelled) return;

        const org = (data as Organization) ?? null;
        setOrganization(org);
        setIndustry(merchant?.business_type ?? null);
        setAppCurrency(org?.currency ?? 'NGN');
        setAppDateFormat(String(data?.settings?.date_format || 'medium'));
      } catch {
        if (!cancelled) {
          setOrganization(null);
          setAppCurrency('NGN');
          setAppDateFormat('medium');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadOrganization();
    return () => {
      cancelled = true;
    };
  }, [user?.organization_id]);

  return (
    <OrganizationContext.Provider value={{ organization, industry: organization?.id === user?.organization_id ? industry : null, isLoading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
