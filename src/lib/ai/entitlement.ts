// Exact catalog identities from migration 010; legacy plan names confer no tier.
export const PLAN_ORDER = [
 'b1000000-0000-0000-0000-000000000001',
 'b2000000-0000-0000-0000-000000000002',
 'b3000000-0000-0000-0000-000000000003',
 'b4000000-0000-0000-0000-000000000004',
 'b5000000-0000-0000-0000-000000000005',
];
export function hasAIEntitlement(state: { active: boolean; plan_id?: string; trial_ends_at?: string | null; server_time: string }) {
  if (!state.active) return false;
  const serverTime=Date.parse(state.server_time);
  if (!Number.isFinite(serverTime)) return false;
  return (!!state.trial_ends_at && Date.parse(state.trial_ends_at)>serverTime) || PLAN_ORDER.indexOf(state.plan_id || '')>=2;
}
