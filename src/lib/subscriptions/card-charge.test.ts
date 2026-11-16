import { expect, it } from 'vitest';
import { classifyCardCharge } from './card-charge';

it('does not count a provider decline with HTTP 200 as a submitted renewal', () => {
  expect(classifyCardCharge(200, { code: '04', description: 'Card declined' }))
    .toEqual({ accepted: false, actionRequired: true });
  expect(classifyCardCharge(200, { code: '00' }))
    .toEqual({ accepted: true, actionRequired: false });
  expect(classifyCardCharge(503, null))
    .toEqual({ accepted: false, actionRequired: false });
});
