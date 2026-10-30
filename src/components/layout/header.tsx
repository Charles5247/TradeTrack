"use client";
import { TranslatedLabel, useCopy } from '@/i18n/text';


import React from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Bell,
  Search,
  Moon,
  Sun,
  Menu,
  LogOut,
  User,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  Upload,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { syncEngine } from "@/lib/offline/sync-engine";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import {
  useUIStore,
  useAuthStore,
  useNotificationStore,
  useSyncStore,
} from "@/store";
import { cn } from "@/lib/utils/cn";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { clearCachedSession } from "@/lib/offline/db";
import { requireOnline } from "@/lib/utils/network";
import { useI18n } from "@/i18n";
import { getBreadcrumbForPath } from "@/components/layout/nav-config";
import { LanguageSelect } from '@/components/shared/language-select';
import type { UserRole } from "@/types";

/**
 * Rebuilt per README §6.3 / design_files/shell.jsx's `Header`: sticky,
 * backdrop-blurred, containing breadcrumb + title/subtitle | ⌘K search
 * trigger | online/offline pill | theme toggle | bell | user menu.
 *
 * Deviation from shell.jsx (flagged, not guessed): the prototype's Header
 * takes `title`/`subtitle`/`breadcrumb` as explicit props supplied by each
 * screen. Retrofitting that into ~19 existing pages is out of scope for
 * this step and would be a much larger, page-by-page change — instead,
 * the breadcrumb + title are derived automatically from the current
 * pathname via `getBreadcrumbForPath` (nav-config.ts), reusing the same
 * grouped nav data. This keeps the Header a drop-in replacement requiring
 * zero per-page changes, while still satisfying the "breadcrumb + title"
 * visual requirement everywhere. Individual pages remain free to render
 * their own in-page <h1>/subtitle inside <main> as before (unchanged).
 *
 * The search input is now a ⌘K trigger (opens the shared CommandPalette
 * dialog via useUIStore.commandPaletteOpen) instead of a plain text field
 * that submitted to `/dashboard?search=`. All other existing wiring
 * (useAuthStore/useNotificationStore/useSyncStore/useOnlineStatus, manual
 * sync button, sign-out flow) is preserved unchanged.
 */
export function Header() {
  const copy = useCopy();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const {
    toggleSidebar,
    mobileSidebarOpen,
    toggleMobileSidebar,
    setCommandPaletteOpen,
  } = useUIStore();
  const { user, setUser } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const { syncStatus, pendingCount } = useSyncStore();
  const { t } = useI18n();
  const isOnline = useOnlineStatus();

  const { breadcrumb, title } = getBreadcrumbForPath(
    pathname,
    user?.role as UserRole | undefined,
    t.nav,
  );

  const handleManualSync = () => {
    if (!requireOnline("Sync upload")) return;
    // Push any queued offline changes (and pull the latest data) right now,
    // on demand — the cashier doesn't have to wait for auto-sync or a
    // network reconnect event to fire.
    void syncEngine?.sync(true);
  };

  const handleSignOut = async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { clearOfflineAuthSession } =
        await import("@/lib/offline/auth-cache");
      const supabase = createClient();
      if (user?.id) {
        await clearCachedSession(user.id);
      }
      clearOfflineAuthSession();
      await supabase.auth.signOut();
      setUser(null);
      router.push("/login");
    } catch {
      setUser(null);
      router.push("/login");
    }
  };

  return (
    <header className="h-[var(--header-h)] border-b border-border bg-[color-mix(in_oklch,var(--c-bg),transparent_20%)] backdrop-blur-[10px] flex items-center gap-2 sm:gap-4 px-3 sm:px-4 lg:px-6 shrink-0 sticky top-0 z-10">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => {
          if (window.matchMedia("(max-width: 1023px)").matches) {
            toggleMobileSidebar();
          } else {
            toggleSidebar();
          }
        }}
        aria-label={copy("Toggle menu")}
        aria-expanded={mobileSidebarOpen}
        aria-controls="app-sidebar"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </Button>

      {/* Breadcrumb + title */}
      <div className="flex-1 min-w-0">
        {breadcrumb.length > 0 && (
          <div className="hidden xl:flex items-center gap-1.5 text-xs tt-muted mb-0.5">
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                <span><TranslatedLabel>{b}</TranslatedLabel></span>
                {i < breadcrumb.length - 1 && (
                  <ChevronRight className="h-3 w-3" strokeWidth={1.75} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="tt-head text-base sm:text-[18px] leading-tight truncate">
          <TranslatedLabel>{title}</TranslatedLabel>
        </div>
      </div>

      {/* ⌘K search trigger */}
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="hidden 2xl:flex items-center gap-2 w-60 shrink-0 h-9 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:border-[var(--c-borderStrong)] transition-colors"
        aria-label={copy("Open search")}
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 text-left truncate">
          {user?.role === "platform_owner" ? copy("Search platform navigation…") : t.header.search_placeholder}
        </span>
        <Kbd>⌘K</Kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 2xl:hidden"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label={copy("Open search")}
      >
        <Search className="h-4 w-4" strokeWidth={1.75} />
      </Button>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {(user?.role === 'business_owner' || user?.role === 'admin') && <Button
          variant="outline"
          className="h-11 min-w-11 shrink-0 gap-2 border-primary/40 text-primary"
          onClick={() => router.push('/assistant')}
          aria-label={copy('Assistant')}
          title={copy('Assistant')}
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">{copy('Assistant')}</span>
        </Button>}
        <div className="hidden xl:block"><LanguageSelect /></div>
        <div
          className={cn(
            "hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
          )}
          style={
            isOnline
              ? {
                  background:
                    "color-mix(in oklch, var(--c-success), transparent 85%)",
                  color: "var(--c-success)",
                  borderColor:
                    "color-mix(in oklch, var(--c-success), transparent 70%)",
                }
              : {
                  background:
                    "color-mix(in oklch, var(--c-warn), transparent 85%)",
                  color: "var(--c-warn)",
                  borderColor:
                    "color-mix(in oklch, var(--c-warn), transparent 70%)",
                }
          }
          title={isOnline ? t.header.online_tooltip : t.header.offline_tooltip}
        >
          {isOnline ? (
            <Wifi className="h-3 w-3" strokeWidth={1.75} />
          ) : (
            <WifiOff className="h-3 w-3" strokeWidth={1.75} />
          )}
          <span>
            {isOnline
              ? t.header.online
              : user?.role !== "platform_owner" && pendingCount > 0
                ? `${t.header.offline} · ${pendingCount} queued`
                : t.header.offline}
          </span>
        </div>

        {user?.role !== "platform_owner" && (syncStatus === "syncing" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            title={t.header.syncing}
          >
            <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative text-muted-foreground"
            onClick={handleManualSync}
            title={
              pendingCount > 0
                ? `Upload ${pendingCount} pending sale${pendingCount === 1 ? "" : "s"} now`
                : "Upload / sync now"
            }
            aria-label={copy("Upload pending data")}
          >
            <Upload className="h-4 w-4" strokeWidth={1.75} />
            {pendingCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px]"
              >
                {pendingCount > 9 ? "9+" : pendingCount}
              </Badge>
            )}
          </Button>
        ))}

        <Button
          variant="ghost"
          size="icon"
          className="hidden xl:inline-flex"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={t.header.toggle_theme}
        >
          <Sun
            className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
            strokeWidth={1.75}
          />
          <Moon
            className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
            strokeWidth={1.75}
          />
          <span className="sr-only">{t.header.toggle_theme}</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => router.push("/notifications")}
          title={t.header.notifications}
          aria-label={`${t.header.notifications}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 px-1 text-[10px] font-bold text-white"
              style={{
                background: "var(--c-danger)",
                borderColor: "var(--c-bg)",
              }}
            >{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label={copy("Settings")}>
              <div className="tt-avatar w-7 h-7 text-[11px]" style={{ background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)", border: "none" }}>
                {user?.full_name?.charAt(0).toUpperCase() ?? "U"}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user?.role?.replace("_", " ")}
                </p>
                {!isOnline && (
                  <p className="text-xs flex items-center gap-1 mt-1" style={{ color: "var(--c-warn)" }}>
                    <WifiOff className="h-3 w-3" strokeWidth={1.75} />
                    {t.header.working_offline}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <div className="px-2 py-2 xl:hidden"><LanguageSelect /></div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="xl:hidden" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              <Sun className="mr-2 h-4 w-4" />{t.header.toggle_theme}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <User className="mr-2 h-4 w-4" strokeWidth={1.75} />
              {t.header.profile}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" strokeWidth={1.75} />
              {t.header.settings}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} />
              {t.header.sign_out}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
