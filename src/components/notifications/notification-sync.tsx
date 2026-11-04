'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useNotificationStore } from '@/store';

/** Keeps the global bell accurate with Realtime and a polling fallback. */
export function NotificationSync() {
  const user = useAuthStore(state => state.user);
  const setUnreadCount = useNotificationStore(state => state.setUnreadCount);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    let disposed = false;
    let hasVisibilityColumn = true;
    const storageKey = `trackasuwa:notifications:unread:${user.id}`;
    const refresh = async () => {
      let result = hasVisibilityColumn
        ? await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false).eq('in_app_visible', true)
        : await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
      if (result.error && hasVisibilityColumn) {
        if (result.error.code === '42703' || result.error.message.includes('in_app_visible')) hasVisibilityColumn = false;
        result = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
      }
      if (result.error) {
        result = await supabase.from('notifications').select('id', { count: 'exact', head: true });
      }
      if (!disposed && !result.error) {
        const next = result.count || 0;
        setUnreadCount(next);
        localStorage.setItem(storageKey, String(next));
      } else if (!disposed) {
        setUnreadCount(Number(localStorage.getItem(storageKey) || 0));
      }
    };
    void refresh();
    const channel = supabase.channel(`notifications:${user.id}`).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: user.role === 'platform_owner' ? `user_id=eq.${user.id}` : `organization_id=eq.${user.organization_id}` },
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
  }, [setUnreadCount, user?.id, user?.organization_id, user?.role]);

  return null;
}
