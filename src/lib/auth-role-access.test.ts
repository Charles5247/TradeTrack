import { describe, expect, it } from 'vitest';
import { canManageBusinessSettings } from './auth-role-access';

describe('canManageBusinessSettings', () => {
  it('allows business owners to manage organization settings', () => {
    expect(canManageBusinessSettings('business_owner', 'org-1')).toBe(true);
  });

  it('allows admins to manage organization settings', () => {
    expect(canManageBusinessSettings('admin', 'org-1')).toBe(true);
  });

  it('does not allow cashiers to manage organization settings', () => {
    expect(canManageBusinessSettings('cashier', 'org-1')).toBe(false);
  });

  it('does not allow platform owners to manage merchant organization settings', () => {
    expect(canManageBusinessSettings('platform_owner', 'org-1')).toBe(false);
  });

  it('requires an organization', () => {
    expect(canManageBusinessSettings('business_owner', null)).toBe(false);
  });
});
