import { describe, expect, it } from 'vitest';
import { wrapReceiptText } from '../receipt-layout';

describe('wrapReceiptText', () => {
  it('wraps long labels to fit the available width without dropping words', () => {
    const wrapped = wrapReceiptText('A very long receipt description that should wrap cleanly', 24);

    expect(wrapped).toEqual([
      'A very long receipt',
      'description that should',
      'wrap cleanly',
    ]);
  });

  it('returns a single line for short content', () => {
    expect(wrapReceiptText('Short text', 40)).toEqual(['Short text']);
  });
});
