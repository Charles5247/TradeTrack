'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, AlertTriangle, Package, DollarSign, ArrowLeftRight, CreditCard } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { Notification } from '@/types';
import { useI18n } from '@/i18n';

async function fetchNotifications() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Notification[];
}

async function markAllRead() {
  const supabase = createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);
  if (error) throw error;
}

const iconMap: Record<string, React.ElementType> = {
  low_stock: Package,
  out_of_stock: AlertTriangle,
  pending_payment: DollarSign,
  pending_transfer: ArrowLeftRight,
  subscription_expiry: CreditCard,
  default: Bell,
};

// Retail token colors instead of hardcoded Tailwind color classes — each
// notification `type` maps to one of the semantic --c-* tokens so the
// icon chip stays correct in both light and dark mode without a
// dark:bg-*-900/30 override.
const colorTokenMap: Record<string, string> = {
  low_stock: 'var(--c-warn)',
  out_of_stock: 'var(--c-danger)',
  pending_payment: 'var(--c-warn)',
  pending_transfer: 'var(--c-info)',
  subscription_expiry: 'var(--c-primary)',
  default: 'var(--c-textMuted)',
};

export default function NotificationsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: notifications = [], isLoading, error, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOneMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const visible = notifications.filter(n => filter === 'all' || (filter === 'unread' ? !n.is_read : filter === 'inventory' ? ['low_stock','out_of_stock','pending_transfer'].includes(n.type) : ['pending_payment','subscription_expiry'].includes(n.type)));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="tt-page-title">{t.notifications.title}</h1>
          <p className="tt-muted text-sm mt-1">
            {unreadCount > 0 ? t.notifications.unread_count.replace('{count}', String(unreadCount)) : t.notifications.all_caught_up}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-2" strokeWidth={1.75} />
            {t.notifications.mark_all_read}
          </Button>
        )}
      </div>

      <Tabs value={filter} onValueChange={setFilter}><TabsList aria-label="Notification filters"><TabsTrigger value="all">All ({notifications.length})</TabsTrigger><TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger><TabsTrigger value="inventory">Inventory</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger></TabsList></Tabs>
      {(markAllReadMutation.error || markOneMutation.error) && <p role="alert" className="text-sm text-destructive">Could not update notifications. Try again.</p>}
      <div className="overflow-hidden rounded-lg border bg-card [&>div]:rounded-none [&>div]:border-x-0 [&>div]:border-t-0 [&>div]:shadow-none">
        {error ? <ErrorState title="Could not load notifications" body={error.message} onRetry={() => refetch()} /> : isLoading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full max-w-48" />
                  <Skeleton className="h-3 w-full max-w-64" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={t.notifications.empty_state}
          />
        ) : (
          visible.map((notification) => {
            const Icon = iconMap[notification.type] || iconMap.default;
            const colorToken = colorTokenMap[notification.type] || colorTokenMap.default;

            return (
              <Card
                key={notification.id}
                role={!notification.is_read ? 'button' : undefined}
                tabIndex={!notification.is_read ? 0 : undefined}
                aria-label={!notification.is_read ? `Mark as read: ${notification.title}` : undefined}
                onKeyDown={event => {
                  if (!notification.is_read && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    markOneMutation.mutate(notification.id);
                  }
                }}
                className={cn(
                  'transition-all',
                  !notification.is_read && 'border-primary/50 bg-primary/5'
                )}
                onClick={() => !notification.is_read && markOneMutation.mutate(notification.id)}
              >
                <CardContent className="p-4 flex gap-4 cursor-pointer">
                  <div
                    className="p-2 rounded-lg h-fit shrink-0"
                    style={{
                      color: colorToken,
                      background: `color-mix(in oklch, ${colorToken}, transparent 88%)`,
                    }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
                      <div className="min-w-0 break-words">
                        <p className={cn('font-medium text-sm', !notification.is_read && 'font-semibold')}>
                          {notification.title}
                        </p>
                        <p className="text-sm tt-muted mt-0.5">{notification.message}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!notification.is_read && (
                          <span className="w-2 h-2 bg-primary rounded-full" />
                        )}
                        <span className="text-xs tt-muted whitespace-nowrap">
                          {formatRelativeTime(notification.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
