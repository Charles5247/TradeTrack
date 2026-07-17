/**
 * TradeTrack - Formatting Utilities
 */

/**
 * In-memory org currency, settable synchronously by whichever provider
 * loads the organization first (OrganizationProvider on dashboard mount,
 * or AuthProvider/Settings via useOrgStore). Consulted by getOrgCurrency()
 * before falling back to the persisted useOrgStore value in localStorage.
 */
let appCurrency = 'NGN';
let appCurrencyExplicitlySet = false;

/** Set org currency (e.g. from OrganizationProvider) so formatCurrency() reflects it immediately. */
export function setAppCurrency(currency: string): void {
  appCurrency = currency || 'NGN';
  appCurrencyExplicitlySet = true;
}

export function getAppCurrency(): string {
  return appCurrency;
}

/**
 * Locale to use per currency code, so amounts render with the
 * correct symbol/placement/grouping for that currency rather than
 * always using Nigerian locale conventions.
 */
const CURRENCY_LOCALES: Record<string, string> = {
  NGN: 'en-NG',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'de-DE',
  GHS: 'en-GH',
  KES: 'en-KE',
  ZAR: 'en-ZA',
  XOF: 'fr-SN',
  XAF: 'fr-CM',
  CNY: 'zh-CN',
  INR: 'en-IN',
};

/**
 * Format currency using the organization's configured currency by default.
 * Pass an explicit `currency` (ISO 4217 code, e.g. 'USD', 'GHS') to override.
 * When no currency is passed, resolves in this order:
 *   1. In-memory appCurrency, if explicitly set via setAppCurrency()
 *   2. The persisted useOrgStore value in localStorage
 *   3. 'NGN' (default / SSR fallback)
 */
export function formatCurrency(amount: number, currency?: string): string {
  const resolvedCurrency = currency || getOrgCurrency();
  const locale = CURRENCY_LOCALES[resolvedCurrency] || 'en-NG';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: resolvedCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Unknown/invalid ISO currency code — fall back to NGN formatting
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

/**
 * Resolves the organization's configured currency. Prefers the in-memory
 * appCurrency (set synchronously via setAppCurrency, e.g. by
 * OrganizationProvider) when available, otherwise reads the persisted
 * Zustand useOrgStore value directly from localStorage (client-side only).
 * Falls back to 'NGN' during SSR or before either source has hydrated.
 */
function getOrgCurrency(): string {
  if (appCurrencyExplicitlySet) return appCurrency;
  if (typeof window === 'undefined') return 'NGN';
  try {
    const raw = localStorage.getItem('tradetrack-org');
    if (!raw) return 'NGN';
    const parsed = JSON.parse(raw);
    return parsed?.state?.currency || 'NGN';
  } catch {
    return 'NGN';
  }
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    ...options,
  }).format(d);
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

/**
 * Generate invoice number
 */
export function generateInvoiceNumber(sequence: number): string {
  return `INV-${String(sequence).padStart(6, '0')}`;
}

/**
 * Truncate text
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format phone number
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}

/**
 * Calculate percentage change
 */
export function percentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
