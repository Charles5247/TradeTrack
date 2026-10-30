'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useNotificationStore } from '@/store';

/** Keeps the global bell accurate with Realtime and a polling fallback. */
export function NotificationSync() {
  const user = useAuthStore(state => state.user);
  const setUnreadCount = useNotificationStore(state => state.setUnreadCount);

  useEffect(() => {
    if (!user?.id || !user.organization_id) return;
    const supabase = createClient();
    let disposed = false;
    const storageKey = `trackasuwa:notifications:unread:${user.id}`;
    const refresh = async () => {
      const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false).eq('in_app_visible', true);
      if (!disposed && !error) {
        const next = count || 0;
        setUnreadCount(next);
        localStorage.setItem(storageKey, String(next));
      } else if (!disposed && error) {
        setUnreadCount(Number(localStorage.getItem(storageKey) || 0));
      }
    };
    void refresh();
    const channel = supabase.channel(`notifications:${user.id}`).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `organization_id=eq.${user.organization_id}` },
      () => void refresh(),
    ).subscribe();
    const timer = window.setInterval(() => { if (navigator.onLine) void refresh(); }, 30_000);
    const reconnect = () => void refresh();
    window.addEventListener('online', reconnect);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('online', reconnect);
      void supabase.removeChannel(channel);
    };
  }, [setUnreadCount, user?.id, user?.organization_id]);

  return null;
}
