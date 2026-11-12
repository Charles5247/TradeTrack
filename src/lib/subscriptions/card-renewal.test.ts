import { afterEach, describe, expect, it } from 'vitest';
import { cardTokenFromVerifiedPayment, decryptCardToken, encryptCardToken, withoutCardToken } from './card-renewal';

const previousKey = process.env.SUBSCRIPTION_CARD_TOKEN_KEY;
afterEach(() => { if (previousKey === undefined) delete process.env.SUBSCRIPTION_CARD_TOKEN_KEY; else process.env.SUBSCRIPTION_CARD_TOKEN_KEY = previousKey; });

describe('provider card renewal token', () => {
  it('encrypts the token with a random nonce and authenticates decryption', () => {
    process.env.SUBSCRIPTION_CARD_TOKEN_KEY = 'ab'.repeat(32);
    const a = encryptCardToken('provider-card-token');
    const b = encryptCardToken('provider-card-token');
    expect(a).not.toBe(b);
    expect(a).not.toContain('provider-card-token');
    expect(decryptCardToken(a)).toBe('provider-card-token');
    expect(() => decryptCardToken(a.slice(0, -2) + 'xx')).toThrow();
  });

  it('only extracts a provider token and removes it from payment evidence', () => {
    const result = { code: '00', data: { txnRef: 'TT-id', cardToken: 'provider-card-token' } };
    expect(cardTokenFromVerifiedPayment(result)).toBe('provider-card-token');
    expect(withoutCardToken(result)).toEqual({ code: '00', data: { txnRef: 'TT-id' } });
    expect(result.data.cardToken).toBe('provider-card-token');
    expect(cardTokenFromVerifiedPayment({ data: { maskedPan: '****1234' } })).toBeNull();
    expect(withoutCardToken({ data: { payment: [{ card_token: 'nested-secret', amount: 100 }] } }))
      .toEqual({ data: { payment: [{ amount: 100 }] } });
  });
});
