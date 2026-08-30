/**
 * Single source of truth for the README §14 hard constraint "POS + KDS
 * pages get data-pos-mode; Reports + Admin pages get data-dense-mode",
 * matched by pathname prefix.
 *
 * Shared by `DashboardLayout` (which passes `pos`/`dense` down to
 * `AppScreen` so it sets the `data-pos-mode`/`data-dense-mode` attributes
 * that drive the CSS density-variable overrides in globals.css) and by
 * `Sidebar` (which additionally needs to know `isPosRoute` on its own —
 * see sidebar.tsx — because POS/KDS's forced 64px collapsed rail is a
 * *content* change, not just a width change, and can't be derived from
 * the `--sidebar-w` CSS variable alone). Keeping the prefix lists in one
 * place avoids the two call sites silently drifting out of sync.
 */
const POS_ROUTE_PREFIXES = ['/pos', '/production'];
const DENSE_ROUTE_PREFIXES = ['/reports', '/admin', '/audit'];

export function isPosRoute(pathname: string): boolean {
  return POS_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
}

export function isDenseRoute(pathname: string): boolean {
  return !isPosRoute(pathname) && DENSE_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
}
