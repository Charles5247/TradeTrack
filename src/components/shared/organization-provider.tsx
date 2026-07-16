'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { setAppCurrency } from '@/lib/utils/format';
import type { Organization } from '@/types';

interface OrganizationContextValue {
  organization: Organization | null;
  isLoading: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue>({
  organization: null,
  isLoading: true,
});

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadOrganization() {
      if (!user?.organization_id) {
        setOrganization(null);
        setAppCurrency('NGN');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', user.organization_id)
          .single();

        if (cancelled) return;

        const org = (data as Organization) ?? null;
        setOrganization(org);
        setAppCurrency(org?.currency ?? 'NGN');
      } catch {
        if (!cancelled) {
          setOrganization(null);
          setAppCurrency('NGN');
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
    <OrganizationContext.Provider value={{ organization, isLoading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
