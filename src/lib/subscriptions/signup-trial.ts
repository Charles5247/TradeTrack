/** The Business plan assigned immediately at self-serve signup. */
export const TRIAL_PLAN_ID = 'b4000000-0000-0000-0000-000000000004';

/** A preference only: never use this value to grant access or charge money. */
export function signupPlanPreference(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}
