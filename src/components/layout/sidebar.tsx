"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Store, LogOut } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useUIStore, useAuthStore, useNotificationStore } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";
import { useOrganization } from "@/components/shared/organization-provider";
import { Logo } from "@/components/layout/logo";
import { getNavGroupsForRole } from "@/components/layout/nav-config";
import type { UserRole } from "@/types";

/**
 * Rebuilt per README §6.3 / design_files/shell.jsx's `Sidebar` +
 * `NAV_GROUPS_BO` / `NAV_GROUPS_PO`: 4 nav groups (Operate/Inventory/
 * Insights/Admin) for Business Owner/Admin/Cashier, 2 groups (Platform/
 * Admin) for Platform Owner. Group/role data now lives in
 * `nav-config.ts`, shared with the ⌘K command palette.
 *
 * Preserves all pre-existing behavior from the old flat-list sidebar:
 * role-based filtering (via nav-config's getNavGroupsForRole, which
 * replaces the old inline `navItems.filter` + `PLATFORM_OWNER_ORDER`
 * re-sort — the grouped structure itself now encodes platform_owner's
 * distinct order/content, so no separate re-sort step is needed),
 * collapse-to-icon-only via useUIStore.sidebarOpen (persisted), the
 * active-item highlighting + collapsed-state tooltip, and the
 * organization name / user info footer.
 *
 * data-pos-mode="true" screens (see the POS layout, Step 5) collapse this
 * sidebar to 64px per README §9.2 — that's handled by the [data-pos-mode]
 * CSS override on --sidebar-w's *consuming* width (this component reads
 * --sidebar-w via Tailwind's arbitrary value, so it automatically shrinks
 * without any JS branching here).
 */
export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { user } = useAuthStore();
  const { organization } = useOrganization();
  const { t } = useI18n();

  const orgLabel =
    organization?.name ??
    (user?.role === "platform_owner" ? "TradeTrack Platform" : t.app.name);

  const groups = getNavGroupsForRole(user?.role as UserRole | undefined);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[color-mix(in_oklch,var(--c-text),transparent_60%)] backdrop-blur-[2px] z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        data-collapsed={!sidebarOpen}
        className={cn(
          "fixed left-0 top-0 z-30 h-full bg-[var(--c-surface)] border-r border-border transition-all flex flex-col",
          "[transition-duration:var(--tt-dur-panel)] [transition-timing-function:var(--tt-ease-panel)]",
          sidebarOpen ? "w-[var(--sidebar-w)]" : "w-16",
          "lg:relative lg:z-auto",
          !sidebarOpen && "max-lg:translate-x-[-100%]",
          sidebarOpen && "max-lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-[var(--header-h)] px-4 border-b border-border shrink-0">
          {sidebarOpen ? (
            <Logo size={28} />
          ) : (
            <Logo size={28} showLabel={false} className="mx-auto" />
          )}
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto p-1 rounded-md hover:bg-accent transition-colors shrink-0 tt-muted"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="mx-auto mt-1 p-1 rounded-md hover:bg-accent transition-colors tt-muted"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}

        {/* Organization Name */}
        {sidebarOpen && (
          <div className="px-3 pb-3 pt-2">
            <div className="tt-card-flat flex items-center gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5">
              <Store className="h-4 w-4 tt-muted shrink-0" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] tt-muted leading-none">
                  {user?.role === "platform_owner" ? "Platform" : "Organization"}
                </div>
                <div className="text-[13px] font-semibold text-foreground truncate">
                  {orgLabel}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation groups */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.title} className="mb-2">
              {sidebarOpen && (
                <div className="tt-nav-section-label px-2 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--c-textFaint)]">
                  {group.title}
                </div>
              )}
              <div className="flex flex-col gap-[1px]">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  const label =
                    t.nav[item.navKey as keyof typeof t.nav] ?? item.navKey;

                  const link = (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm font-medium transition-all duration-[140ms] group relative",
                        isActive
                          ? "bg-[color-mix(in_oklch,var(--c-primary),transparent_90%)] text-primary font-semibold"
                          : "text-[var(--c-textMuted)] hover:bg-[var(--c-surfaceAlt)] hover:text-foreground",
                        !sidebarOpen && "justify-center",
                      )}
                      onClick={() => {
                        if (window.innerWidth < 1024) setSidebarOpen(false);
                      }}
                    >
                      {isActive && (
                        <span
                          className="absolute -left-3 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-primary"
                          aria-hidden="true"
                        />
                      )}
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      {sidebarOpen && (
                        <>
                          <span className="flex-1 truncate">{label}</span>
                          {item.navKey === "notifications" && (
                            <NotificationBadge />
                          )}
                        </>
                      )}
                    </Link>
                  );

                  if (sidebarOpen) return link;

                  return (
                    <Tooltip key={item.href} delayDuration={0}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Info */}
        {sidebarOpen && user && (
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="tt-avatar" style={{ background: "var(--c-primary)", color: "var(--c-primaryFg)" }}>
                {user.full_name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight truncate">
                  {user.full_name}
                </p>
                <p className="text-[11px] tt-muted capitalize truncate">
                  {user.role.replace("_", " ")}
                </p>
              </div>
              <LogOut className="h-3.5 w-3.5 tt-faint shrink-0" strokeWidth={1.75} />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function NotificationBadge() {
  const { unreadCount } = useNotificationStore();
  if (!unreadCount) return null;
  return (
    <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-5">
      {unreadCount > 99 ? "99+" : unreadCount}
    </Badge>
  );
}
