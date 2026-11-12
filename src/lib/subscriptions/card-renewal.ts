import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
  const key = process.env.SUBSCRIPTION_CARD_TOKEN_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('Card renewal encryption is not configured');
  return Buffer.from(key, 'hex');
}

export function encryptCardToken(token: string): string {
  if (!token || token.length > 2048) throw new Error('Invalid provider card token');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

export function decryptCardToken(value: string): string {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted card token');
  const [iv, tag, ciphertext] = parts.map(part => Buffer.from(part, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted card token');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function cardTokenFromVerifiedPayment(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
  const token = data.cardToken ?? data.card_token;
  return typeof token === 'string' && token.length >= 8 && token.length <= 2048 ? token : null;
}

/** Keep the charge proof, never persist a reusable provider token in a payment log. */
export function withoutCardToken(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const result = { ...(value as Record<string, unknown>) };
  const data = result.data && typeof result.data === 'object' ? { ...(result.data as Record<string, unknown>) } : null;
  delete result.cardToken;
  delete result.card_token;
  if (data) {
    delete data.cardToken;
    delete data.card_token;
    result.data = data;
  }
  return result;
}
