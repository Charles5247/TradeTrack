import { expect, it } from 'vitest';
import { requireOrganization } from '../organization';
it.each([null, {}, { organization_id: '' }, { organization_id: '   ' }])('blocks missing business: %s', (profile) => {
  expect(() => requireOrganization(profile)).toThrow('not linked to a business');
});
it('preserves a real organization id', () => expect(requireOrganization({ organization_id: 'org' })).toBe('org'));
