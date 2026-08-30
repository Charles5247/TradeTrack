'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Sun,
  Moon,
  Monitor,
  LogOut,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { getNavGroupsForRole } from '@/components/layout/nav-config';
import { useAuthStore, useUIStore } from '@/store';
import { useI18n } from '@/i18n';
import type { UserRole } from '@/types';

/**
 * ⌘K command palette (README §9.1 / §6.3 Header). Wraps the shadcn-style
 * <CommandDialog> (cmdk) with TradeTrack's own nav groups so the same
 * data source drives both the Sidebar and this palette. Global mount point
 * is DashboardLayout (see dashboard-layout.tsx) so ⌘K works from any
 * dashboard screen. Open state lives in useUIStore.commandPaletteOpen so
 * the Header's search field (clicking it, or its ⌘K kbd hint) can open the
 * same dialog instance rather than each owning separate state.
 */
export function CommandPalette() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  const runCommand = React.useCallback(
    (fn: () => void) => {
      setOpen(false);
      fn();
    },
    [setOpen]
  );

  const groups = getNavGroupsForRole(user?.role as UserRole | undefined);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search screens, products, sales, merchants…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.title} heading={group.title}>
            {group.items.map((item) => {
              const Icon = item.icon;
              const label = t.nav[item.navKey as keyof typeof t.nav] ?? item.navKey;
              return (
                <CommandItem
                  key={item.href}
                  value={`${group.title} ${label}`}
                  onSelect={() => runCommand(() => router.push(item.href))}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => runCommand(() => setTheme('light'))}>
            <Sun className="h-4 w-4" />
            <span>Light</span>
            {theme === 'light' && <CommandShortcut>Active</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme('dark'))}>
            <Moon className="h-4 w-4" />
            <span>Dark</span>
            {theme === 'dark' && <CommandShortcut>Active</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme('system'))}>
            <Monitor className="h-4 w-4" />
            <span>System</span>
            {theme === 'system' && <CommandShortcut>Active</CommandShortcut>}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => runCommand(() => router.push('/dashboard'))}>
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
            <LogOut className="h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
