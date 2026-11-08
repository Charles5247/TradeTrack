'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useNotificationStore } from '@/store';
import { playAlertSound, showDesktopAlert } from '@/lib/notifications/desktop';

/** Keeps the global bell accurate with Realtime and a polling fallback. */
export function NotificationSync() {
  const user = useAuthStore(state => state.user);
  const setUnreadCount = useNotificationStore(state => state.setUnreadCount);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    let disposed = false;
    let announced = false;
    let hasVisibilityColumn = true;
    let knownIds: Set<string> | null = null;
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
        if (!announced) {
          announced = true;
          if (next > 0) toast.info(`You have ${next} unread notification${next === 1 ? '' : 's'}.`, {
            action: { label: 'View', onClick: () => { window.location.href = '/notifications'; } },
          });
        }
        const latest = hasVisibilityColumn
          ? await supabase.from('notifications').select('id,title,message,body,data').eq('is_read', false).eq('in_app_visible', true).order('created_at', { ascending: false }).limit(20)
          : await supabase.from('notifications').select('id,title,message,body,data').eq('is_read', false).order('created_at', { ascending: false }).limit(20);
        if (!disposed && !latest.error) {
          const rows = latest.data || [];
          if (knownIds) {
            for (const item of rows.slice().reverse()) {
              if (knownIds.has(item.id)) continue;
              toast.info(item.title || 'New notification', {
                description: item.message || item.body || undefined,
                action: { label: 'View', onClick: () => { window.location.href = '/notifications'; } },
              });
              playAlertSound();
              const href = typeof item.data?.href === 'string' && /^\/(admin\/support|support|notifications|warehouse-memos|transfers|purchase-orders)$/.test(item.data.href)
                ? item.data.href : '/notifications';
              void showDesktopAlert(item.id, item.title || 'Trackasuwa notification', item.message || item.body || '', href).catch(() => {});
            }
          }
          knownIds = new Set(rows.map(item => item.id));
        }
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
