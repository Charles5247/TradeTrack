import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  generateInvoiceNumber,
  truncate,
  formatFileSize,
  formatPhone,
  percentageChange,
} from '../format';

describe('formatCurrency', () => {
  it('formats NGN by default when no currency and no org store present', () => {
    // No localStorage in this Node test environment (typeof window === 'undefined'),
    // so getOrgCurrency() falls back to 'NGN'.
    const result = formatCurrency(1000);
    expect(result).toContain('1,000');
    expect(result).toMatch(/₦|NGN/);
  });

  it('formats an explicit currency code (USD)', () => {
    const result = formatCurrency(2500, 'USD');
    expect(result).toContain('2,500');
    expect(result).toMatch(/\$|USD/);
  });

  it('formats an explicit currency code (GHS)', () => {
    const result = formatCurrency(500, 'GHS');
    expect(result).toContain('500');
  });

  it('falls back to NGN formatting for an unknown/invalid currency code', () => {
    const result = formatCurrency(100, 'NOT_A_CODE');
    expect(result).toContain('100');
    expect(result).toMatch(/₦|NGN/);
  });

  it('formats zero and negative amounts without throwing', () => {
    expect(() => formatCurrency(0, 'USD')).not.toThrow();
    expect(() => formatCurrency(-500, 'USD')).not.toThrow();
    expect(formatCurrency(-500, 'USD')).toContain('500');
  });

  it('rounds to whole units (no decimal places)', () => {
    const result = formatCurrency(1999.99, 'USD');
    // minimumFractionDigits/maximumFractionDigits are both 0
    expect(result).not.toContain('.99');
  });
});

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    const result = formatDate('2026-01-15T00:00:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date(2026, 0, 15));
    expect(typeof result).toBe('string');
  });

  it('respects custom Intl.DateTimeFormatOptions', () => {
    const result = formatDate('2026-06-01T00:00:00.000Z', { dateStyle: 'short' });
    expect(typeof result).toBe('string');
  });
});

describe('formatDateTime', () => {
  it('includes both date and time components', () => {
    const result = formatDateTime('2026-03-10T14:30:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for a time less than 60 seconds ago', () => {
    const thirtySecondsAgo = new Date('2026-07-17T11:59:30.000Z');
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('Just now');
  });

  it('returns minutes ago for a time within the last hour', () => {
    const fiveMinutesAgo = new Date('2026-07-17T11:55:00.000Z');
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago');
  });

  it('returns hours ago for a time within the last day', () => {
    const threeHoursAgo = new Date('2026-07-17T09:00:00.000Z');
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('returns days ago for a time within the last week', () => {
    const twoDaysAgo = new Date('2026-07-15T12:00:00.000Z');
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
  });

  it('falls back to a formatted date for anything older than a week', () => {
    const twoWeeksAgo = new Date('2026-07-03T12:00:00.000Z');
    const result = formatRelativeTime(twoWeeksAgo);
    expect(result).not.toMatch(/ago$/);
  });
});

describe('generateInvoiceNumber', () => {
  it('pads the sequence number to 6 digits', () => {
    expect(generateInvoiceNumber(1)).toBe('INV-000001');
    expect(generateInvoiceNumber(42)).toBe('INV-000042');
  });

  it('does not truncate sequence numbers longer than 6 digits', () => {
    expect(generateInvoiceNumber(1234567)).toBe('INV-1234567');
  });

  it('handles zero', () => {
    expect(generateInvoiceNumber(0)).toBe('INV-000000');
  });
});

describe('truncate', () => {
  it('returns the original text if shorter than maxLength', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('returns the original text if exactly maxLength', () => {
    expect(truncate('exact', 5)).toBe('exact');
  });

  it('truncates and appends ellipsis when longer than maxLength', () => {
    expect(truncate('this is a long string', 7)).toBe('this is...');
  });
});

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes under 1KB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });
});

describe('formatPhone', () => {
  it('formats an 11-digit Nigerian phone number', () => {
    expect(formatPhone('08012345678')).toBe('0801 234 5678');
  });

  it('strips non-digit characters before formatting', () => {
    expect(formatPhone('0801-234-5678')).toBe('0801 234 5678');
  });

  it('returns the original string unmodified if not 11 digits', () => {
    expect(formatPhone('12345')).toBe('12345');
  });
});

describe('percentageChange', () => {
  it('calculates a positive percentage increase', () => {
    expect(percentageChange(150, 100)).toBe(50);
  });

  it('calculates a negative percentage decrease', () => {
    expect(percentageChange(50, 100)).toBe(-50);
  });

  it('returns 0 when current and previous are equal', () => {
    expect(percentageChange(100, 100)).toBe(0);
  });

  it('returns 100 when previous is 0 and current is positive', () => {
    expect(percentageChange(50, 0)).toBe(100);
  });

  it('returns 0 when both current and previous are 0', () => {
    expect(percentageChange(0, 0)).toBe(0);
  });
});
