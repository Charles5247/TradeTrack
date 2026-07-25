"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime changes on the given tables, scoped to the
 * owner's organization, and invalidates the given react-query key whenever a
 * change comes in.
 *
 * This is how the owner's dashboard "just updates" the moment a cashier's
 * device (which may have been offline) finishes syncing its queued
 * sales/inventory changes to Supabase — no manual action needed on the
 * owner's side. It is NOT a way to reach into an offline cashier device;
 * it only reacts to data that has already made it to Supabase.
 *
 * The owner can still hit a manual "Refresh" button (wired to the query's
 * own refetch()) for an explicit, on-demand pull — useful right after they
 * know a cashier just came back online, or just as a reassurance action.
 */
export function useRealtimeSync(
  tables: string[],
  organizationId: string | undefined,
  queryKey: unknown[],
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!organizationId || tables.length === 0) return;

    const supabase = createClient();
    const channel = supabase.channel(`realtime-sync-${organizationId}`);

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, tables.join(","), queryClient, queryKey]);
}
