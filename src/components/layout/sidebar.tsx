'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  History,
  ArrowLeftRight,
  Users,
  BarChart3,
  ClipboardList,
  Bell,
  Settings,
  CreditCard,
  TrendingUp,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Store,
  Building2,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUIStore, useAuthStore } from '@/store';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { useOrganization } from '@/components/shared/organization-provider';
import type { UserRole } from '@/types';

interface NavItem {
  titleKey: keyof typeof import('@/i18n/locales/en').en.nav;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  roles?: UserRole[];
  /** Platform-only routes visible to super_admin without org context */
  platformOnly?: boolean;
}

const navItems: NavItem[] = [
  { titleKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { titleKey: 'products', href: '/products', icon: Package, roles: ['super_admin', 'admin'] },
  { titleKey: 'inventory', href: '/inventory', icon: Warehouse, roles: ['super_admin', 'admin'] },
  { titleKey: 'pos', href: '/pos', icon: ShoppingCart },
  { titleKey: 'sales', href: '/sales', icon: History, roles: ['super_admin', 'admin'] },
  { titleKey: 'warehouses', href: '/warehouses', icon: Warehouse, roles: ['super_admin', 'admin'] },
  { titleKey: 'transfers', href: '/transfers', icon: ArrowLeftRight, roles: ['super_admin', 'admin'] },
  { titleKey: 'vendors', href: '/vendors', icon: UserCheck, roles: ['super_admin', 'admin'] },
  { titleKey: 'reports', href: '/reports', icon: BarChart3, roles: ['super_admin', 'admin'] },
  { titleKey: 'audit', href: '/audit', icon: ClipboardList, roles: ['super_admin', 'admin'] },
  { titleKey: 'notifications', href: '/notifications', icon: Bell },
  { titleKey: 'users', href: '/users', icon: Users, roles: ['super_admin'] },
  { titleKey: 'subscriptions', href: '/subscriptions', icon: CreditCard, roles: ['super_admin'] },
  { titleKey: 'admin', href: '/admin', icon: Shield, roles: ['super_admin'], platformOnly: true },
  { titleKey: 'merchants', href: '/merchants', icon: Building2, roles: ['super_admin'], platformOnly: true },
  { titleKey: 'settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { user } = useAuthStore();
  const { organization } = useOrganization();
  const { t } = useI18n();

  const orgLabel = organization?.name ?? (user?.role === 'super_admin' ? 'TradeTrack Platform' : t.app.name);

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!user) return false;
    if (!item.roles.includes(user.role)) return false;
    if (item.platformOnly && user.role !== 'super_admin') return false;
    return true;
  });

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-30 h-full bg-card border-r border-border transition-all duration-300 flex flex-col',
          sidebarOpen ? 'w-64' : 'w-16',
          'lg:relative lg:z-auto',
          !sidebarOpen && 'max-lg:translate-x-[-100%]',
          sidebarOpen && 'max-lg:translate-x-0'
        )}
      >
        <div className="flex items-center h-16 px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-primary-foreground" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="font-bold text-sm leading-none truncate">{t.app.name}</p>
                <p className="text-xs text-muted-foreground truncate">{t.app.tagline}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              'ml-auto p-1 rounded-md hover:bg-accent transition-colors shrink-0',
              !sidebarOpen && 'mx-auto'
            )}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>

        {sidebarOpen && (
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground truncate">
                {orgLabel}
              </span>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {filteredItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            const label = t.nav[item.titleKey];

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-colors group relative',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  !sidebarOpen && 'justify-center'
                )}
                onClick={() => {
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary-foreground' : '')} />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 truncate">{label}</span>
                    {item.badge && item.badge > 0 && (
                      <Badge variant="destructive" className="text-xs py-0 px-1.5 h-5">
                        {item.badge > 99 ? '99+' : item.badge}
                      </Badge>
                    )}
                  </>
                )}
                {!sidebarOpen && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {sidebarOpen && user && (
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">
                  {user.full_name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize truncate">{user.role.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
