/** Account hints bind an in-flight browser task to the authenticated context.
 * They can only reject a mismatch; the server still derives all authority. */
export function assertExpectedAccount(request: Request, profile: { id: string; organization_id: string | null }) {
  const owner = request.headers.get('X-Track-Expected-Owner');
  const organization = request.headers.get('X-Track-Expected-Organization');
  if ((owner && owner !== profile.id) || (organization && organization !== profile.organization_id))
    throw new Error('ACCOUNT_CHANGED: Your account changed. Reopen this task in its original account.');
}
