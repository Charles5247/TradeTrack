'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useUIStore, useAuthStore, useNotificationStore, useSyncStore } from '@/store';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';

export function Header() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar } = useUIStore();
  const { user } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const { syncStatus, lastSync } = useSyncStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dashboard?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleSignOut = async () => {
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  const isOnline = typeof window !== 'undefined' ? navigator.onLine : true;

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center gap-4 px-4 lg:px-6 shrink-0">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={toggleSidebar}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <Input
          type="search"
          placeholder="Search products, sales, invoices..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          className="h-8"
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        {/* Online/Offline Status */}
        <div
          className={cn(
            'hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
            isOnline
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}
        >
          {isOnline ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Sync Status */}
        {syncStatus === 'syncing' && (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
          </Button>
        )}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => router.push('/notifications')}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary">
                  {user?.full_name?.charAt(0).toUpperCase() ?? 'U'}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user?.role?.replace('_', ' ')}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
