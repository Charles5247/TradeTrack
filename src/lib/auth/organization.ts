export function requireOrganization(profile: { organization_id?: string | null } | null): string {
  const id = profile?.organization_id;
  if (!id?.trim()) throw new Error('Your account is not linked to a business. Please contact your business owner.');
  return id;
}
