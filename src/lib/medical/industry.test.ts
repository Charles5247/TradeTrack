import { describe, expect, it } from 'vitest';
import { isMedicalIndustry } from '@/lib/industries';
import { getFlatNavItems } from '@/components/layout/nav-config';

describe('industry-specific navigation', () => {
  it.each(['pharmacy','medical_store','medical_wholesale','medical_manufacturing','hospital'])('offers medical stock for %s', industry => {
    expect(isMedicalIndustry(industry)).toBe(true);
    for (const role of ['business_owner','admin','cashier'] as const) {
      expect(getFlatNavItems(role, industry).map(item => item.href)).toContain('/medical-stock');
    }
  });
  it.each(['electronics','fashion','retail','wholesale','manufacturing','other',null,undefined])('preserves retail navigation for %s', industry => {
    const links=getFlatNavItems('business_owner', industry).map(item => item.href);
    expect(links).not.toContain('/medical-stock');
    expect(links).toEqual(expect.arrayContaining(['/pos','/inventory','/products']));
  });
  it('does not add merchant workflows to platform-owner navigation', () => {
    expect(getFlatNavItems('platform_owner','pharmacy').map(item => item.href)).not.toContain('/medical-stock');
  });
});
