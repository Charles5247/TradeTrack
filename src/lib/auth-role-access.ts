import type { UserRole } from '@/types';

export function canManageBusinessSettings(role?: UserRole, organizationId?: string | null): boolean {
  return Boolean(
    organizationId &&
    (role === 'business_owner' || role === 'admin')
  );
}
