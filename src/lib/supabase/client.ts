import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // AuthProvider explicitly starts this only while the browser is online.
      // Leaving Supabase's browser default enabled causes refresh-token retry
      // requests while a POS is intentionally offline.
      auth: { autoRefreshToken: false },
    },
  );
}
