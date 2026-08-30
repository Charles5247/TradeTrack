import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  History,
  ArrowLeftRight,
  ClipboardCheck,
  Users,
  BarChart3,
  ClipboardList,
  Bell,
  Settings,
  CreditCard,
  UserCheck,
  Building2,
  Shield,
  Search,
} from "lucide-react";
import type { UserRole } from "@/types";

/**
 * Grouped sidebar navigation, per README §6.3 / design_files/shell.jsx's
 * NAV_GROUPS_BO / NAV_GROUPS_PO. Extracted into its own module (rather than
 * living inline in sidebar.tsx) so the same group/role/href/label/icon data
 * can be reused by the ⌘K command palette (command-palette.tsx) without
 * duplicating the list.
 *
 * `navKey` matches the existing `t.nav.*` i18n translation keys
 * (src/i18n/locales/*.ts) so every locale's labels keep working unchanged.
 *
 * Deviation from shell.jsx (flagged, not guessed): the prototype's
 * NAV_GROUPS_BO omits "Notifications" entirely for Business Owner/Admin/
 * Cashier — relying on the header bell instead. We keep that behavior
 * (notifications is NOT a sidebar item for those roles) since the header
 * bell already navigates to /notifications for every role. Platform Owner
 * keeps Notifications in its "Admin" group, matching shell.jsx exactly.
 */
export interface NavItem {
  navKey: string;
  href: string;
  icon: ComponentType<LucideProps>;
  /** Roles allowed to see this item. Omit for "every authenticated role". */
  roles?: UserRole[];
}

export interface NavGroup {
  /** i18n-free group title — these are structural section headers, not
   *  yet localized (README doesn't specify translated group titles; the
   *  four/two group names are treated as fixed English labels for now,
   *  matching shell.jsx's literal "Operate/Inventory/Insights/Admin" and
   *  "Platform/Admin" titles). */
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS_BO: NavGroup[] = [
  {
    title: "Operate",
    items: [
      {
        navKey: "dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        roles: ["business_owner", "admin", "cashier"],
      },
      {
        navKey: "pos",
        href: "/pos",
        icon: ShoppingCart,
        roles: ["business_owner", "admin", "cashier"],
      },
      {
        navKey: "sales",
        href: "/sales",
        icon: History,
        roles: ["business_owner", "admin"],
      },
      {
        navKey: "receiptLookup",
        href: "/receipts/lookup",
        icon: Search,
        roles: ["business_owner", "admin", "cashier"],
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        navKey: "products",
        href: "/products",
        icon: Package,
        roles: ["business_owner", "admin"],
      },
      {
        navKey: "inventory",
        href: "/inventory",
        icon: Warehouse,
        roles: ["business_owner", "admin"],
      },
      {
        navKey: "purchaseOrders",
        href: "/purchase-orders",
        icon: ClipboardCheck,
        roles: ["business_owner", "admin"],
      },
      {
        navKey: "transfers",
        href: "/transfers",
        icon: ArrowLeftRight,
        roles: ["business_owner", "admin"],
      },
      {
        navKey: "vendors",
        href: "/vendors",
        icon: UserCheck,
        roles: ["business_owner", "admin"],
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        navKey: "reports",
        href: "/reports",
        icon: BarChart3,
        roles: ["business_owner", "admin"],
      },
      {
        navKey: "audit",
        href: "/audit",
        icon: ClipboardList,
        roles: ["business_owner", "admin"],
      },
    ],
  },
  {
    title: "Admin",
    items: [
      {
        navKey: "users",
        href: "/users",
        icon: Users,
        roles: ["business_owner"],
      },
      {
        navKey: "subscriptions",
        href: "/subscriptions",
        icon: CreditCard,
        roles: ["business_owner"],
      },
      { navKey: "settings", href: "/settings", icon: Settings },
    ],
  },
];

export const NAV_GROUPS_PO: NavGroup[] = [
  {
    title: "Platform",
    items: [
      {
        navKey: "admin",
        href: "/admin",
        icon: Shield,
        roles: ["platform_owner"],
      },
      {
        navKey: "merchants",
        href: "/merchants",
        icon: Building2,
        roles: ["platform_owner"],
      },
      {
        navKey: "subscriptions",
        href: "/subscriptions",
        icon: CreditCard,
        roles: ["platform_owner"],
      },
    ],
  },
  {
    title: "Admin",
    items: [
      { navKey: "notifications", href: "/notifications", icon: Bell },
      { navKey: "settings", href: "/settings", icon: Settings },
    ],
  },
];

/** Returns the appropriate group set for a role, with items already
 * filtered to what that role may see (and empty groups dropped). */
export function getNavGroupsForRole(role: UserRole | undefined): NavGroup[] {
  const groups = role === "platform_owner" ? NAV_GROUPS_PO : NAV_GROUPS_BO;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.roles || (role && item.roles.includes(role)),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** Flat list of every nav item across both role's groups — used by the
 * command palette, which shows the current user's own items regardless of
 * grouping. */
export function getFlatNavItems(role: UserRole | undefined): NavItem[] {
  return getNavGroupsForRole(role).flatMap((g) => g.items);
}

/**
 * Derives the Header's breadcrumb + page title from the current pathname,
 * without requiring every one of the ~19 existing dashboard pages to opt in
 * individually (README §6.3's Header spec: "breadcrumb + title/subtitle").
 * Matches the same longest-prefix-wins logic the old flat sidebar.tsx used
 * for its `isActive` check, so a sub-route like `/products/123/edit` still
 * resolves to the "Products" nav item.
 *
 * Falls back to a humanized version of the first path segment for routes
 * that aren't in the nav config at all (e.g. `/change-password`,
 * `/sales/[id]` detail pages once Step 7 adds them) — never leaves the
 * header title blank.
 */
export function getBreadcrumbForPath(
  pathname: string,
  role: UserRole | undefined,
  navLabels: Record<string, string>,
): { breadcrumb: string[]; title: string } {
  const groups = role === "platform_owner" ? NAV_GROUPS_PO : NAV_GROUPS_BO;
  let bestMatch: { group: NavGroup; item: NavItem } | null = null;

  for (const group of groups) {
    for (const item of group.items) {
      if (item.roles && (!role || !item.roles.includes(role))) continue;
      const isMatch =
        pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(item.href));
      if (isMatch) {
        if (
          !bestMatch ||
          item.href.length > bestMatch.item.href.length
        ) {
          bestMatch = { group, item };
        }
      }
    }
  }

  if (bestMatch) {
    const label = navLabels[bestMatch.item.navKey] ?? bestMatch.item.navKey;
    return { breadcrumb: [bestMatch.group.title], title: label };
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  const humanized = firstSegment
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return { breadcrumb: [], title: humanized || "TradeTrack" };
}
