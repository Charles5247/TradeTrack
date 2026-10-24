'use client';

import React, { useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { requireTransactionSubscription } from '@/lib/subscriptions/verification';
import { useAuthStore } from '@/store';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { accountIdentity } from '@/lib/auth/account-state';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const identity = accountIdentity(user);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onMutate: async (variables) => {
            // PO creation is a protected module. Enforce its existing mutation
            // contract here, before its atomic IndexedDB transaction starts.
            if (variables && typeof variables === "object" && ("supplier_id" in variables || "vendor_name" in variables) && "items" in variables) {
              await requireTransactionSubscription(useAuthStore.getState().user?.organization_id || "");
            }
          },
        }),
        defaultOptions: {
          queries: {
            meta: { account: identity },
            staleTime: 60 * 1000, // 1 minute
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [identity],
  );
  useEffect(() => () => {
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
