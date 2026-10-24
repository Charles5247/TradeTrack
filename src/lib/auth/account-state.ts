import type { User } from '@/types';

// A namespace alone cannot detect logout or an A -> B -> A switch while an
// asynchronous operation is in flight. This revision is scoped to the tab.
let accountRevision = 0;
export function getAccountRevision(): number { return accountRevision; }
export function advanceAccountRevision(): void { accountRevision++; }

export function accountIdentity(user: Pick<User, 'id' | 'organization_id' | 'role' | 'status'> | null): string {
  return user ? `${user.organization_id ?? 'platform'}:${user.id}:${user.role}:${user.status}` : 'signed-out';
}

/** Legacy unscoped storage is deliberately left intact, never assigned to a user. */
export function readAccountState(key: string): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return saved?.state && typeof saved.state === 'object' ? saved.state : {};
  } catch {
    return {};
  }
}
