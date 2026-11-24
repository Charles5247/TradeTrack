import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NIGERIAN_STATES, localPriceResultSchema } from './local-price-contract';

vi.mock('server-only', () => ({}));

const egress = vi.hoisted(() => ({ dns: vi.fn(), get: vi.fn() }));
vi.mock('node:dns/promises', () => ({
  Resolver: class {
    resolve4 = egress.dns;
    cancel = vi.fn();
  },
}));
vi.mock('node:https', () => ({ get: egress.get }));

import {
  isLocalPriceSearchEnabled, LocalPriceUnavailable, lookupLocalPrice, registeredPriceArea,
} from './local-price';

const now = new Date('2026-11-23T10:00:00.000Z');
const location = { state: 'Kano', city: 'Kano' } as const;
const product = {
  name: 'Picnic biscuits', make: 'Picnic', variantSize: '75 g',
  barcode: '4006381333931', stockUnit: 'piece', unitsPerPack: 1,
};

function feed(seller: string, host: string) {
  return { seller, url: 'https://' + host + '/offers', approved: true };
}

function setFeeds(...feeds: ReturnType<typeof feed>[]) {
  vi.stubEnv('AI_LOCAL_PRICE_FEEDS', JSON.stringify(feeds));
}

function offer(host: string, priceMinor: string, overrides: Record<string, unknown> = {}) {
  return {
    product, area: location, priceMinor, currency: 'NGN', salesType: 'retail',
    available: true, fulfilment: 'pickup', observedAt: now.toISOString(),
    url: 'https://' + host + '/product/picnic', ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  setFeeds(feed('Kano Retail', 'feed.retail-one.ng'), feed('North Market', 'feed.retail-two.ng'));
});

afterEach(() => vi.unstubAllEnvs());

describe('local price evidence', () => {
  it('supports every state plus the FCT and normalizes structured registered areas', () => {
    expect(new Set(NIGERIAN_STATES).size).toBe(37);
    expect(registeredPriceArea('Kano State', 'Kano')).toEqual(location);
    expect(registeredPriceArea('Abuja', '14 Street')).toEqual({ state: 'Federal Capital Territory' });
    expect(registeredPriceArea('Unknown', 'Kano')).toBeNull();
  });

  it('queries only the confirmed state and derives an exact median from distinct sellers', async () => {
    const load = vi.fn(async (url: URL) => ({
      offers: url.hostname === 'feed.retail-one.ng'
        ? [offer(url.hostname, '19000'), offer(url.hostname, '19800')]
        : [offer(url.hostname, '21001', { feeMinor: '500' })],
    }));
    const result = localPriceResultSchema.parse(await lookupLocalPrice(product, location, load, now));
    expect(result.status).toBe('suggested');
    if (result.status !== 'suggested') throw new Error('Expected price evidence');
    expect(result.suggestedPriceMinor).toBe('20001');
    expect(result.offers).toEqual([
      expect.objectContaining({ seller: 'Kano Retail', priceMinor: '19000', location: 'Kano, Kano', checkedAt: now.toISOString() }),
      expect.objectContaining({ seller: 'North Market', priceMinor: '21001', feeMinor: '500' }),
    ]);
    for (const [url] of load.mock.calls) {
      expect([...url.searchParams]).toEqual([['state', 'Kano']]);
    }
  });

  it('ignores wholesale, stale, shipping-only, out-of-area, wrong pack and cross-host listings', async () => {
    const host = 'feed.retail-one.ng';
    setFeeds(feed('Kano Retail', host));
    const load = vi.fn().mockResolvedValue({
      offers: [
        offer(host, '1000', { salesType: 'wholesale' }),
        offer(host, '1000', { available: false }),
        offer(host, '1000', { observedAt: '2026-11-19T10:00:00.000Z' }),
        offer(host, '1000', { fulfilment: 'shipping' }),
        offer(host, '1000', { area: { state: 'Lagos', city: 'Kano' } }),
        offer(host, '1000', { area: { state: 'Kano', city: 'Wudil' } }),
        offer(host, '1000', { product: { ...product, unitsPerPack: 12 } }),
        offer(host, '1000', { product: { ...product, variantSize: '170 g' } }),
        offer(host, '1000', { url: 'https://different.store.ng/sale' }),
        offer(host, '20000'),
      ],
    });
    expect(await lookupLocalPrice(product, location, load, now)).toEqual({
      status: 'observed', area: location,
      offers: [expect.objectContaining({ priceMinor: '20000' })],
    });
  });

  it('reports insufficient local evidence as a valid empty result', async () => {
    const load = vi.fn().mockResolvedValue({ offers: [] });
    expect(await lookupLocalPrice(product, { state: 'Plateau' }, load, now)).toEqual({
      status: 'no_local_price', area: { state: 'Plateau' }, offers: [],
    });
  });

  it('distinguishes complete source failure from a successful search without a match', async () => {
    await expect(lookupLocalPrice(product, location, vi.fn().mockRejectedValue(new Error('upstream')), now))
      .rejects.toBeInstanceOf(LocalPriceUnavailable);
  });
});

describe('approved source boundaries', () => {
  it.each([
    'http://retailer.ng/feed', 'https://127.0.0.1/feed', 'https://192.168.0.1/feed',
    'https://retailer.ng:8080/feed', 'https://retailer.internal/feed',
    'https://retailer.ng/feed?secret=fixture', 'https://user:pass@retailer.ng/feed',
  ])('rejects unsafe feed config %s', async url => {
    vi.stubEnv('AI_LOCAL_PRICE_FEEDS', JSON.stringify([{ seller: 'Retail', url, approved: true }]));
    const load = vi.fn();
    expect(isLocalPriceSearchEnabled()).toBe(false);
    await expect(lookupLocalPrice(product, location, load, now)).rejects.toBeInstanceOf(LocalPriceUnavailable);
    expect(load).not.toHaveBeenCalled();
  });

  it('requires approved, independent sources and stops when a source is removed', () => {
    vi.stubEnv('AI_LOCAL_PRICE_FEEDS', JSON.stringify([{ ...feed('One', 'retailer.ng'), approved: false }]));
    expect(isLocalPriceSearchEnabled()).toBe(false);
    setFeeds(feed('One', 'retailer.ng'), feed('ONE', 'other.ng'));
    expect(isLocalPriceSearchEnabled()).toBe(false);
    setFeeds(feed('One', 'retailer.ng'));
    expect(isLocalPriceSearchEnabled()).toBe(true);
    vi.stubEnv('AI_LOCAL_PRICE_FEEDS', '');
    expect(isLocalPriceSearchEnabled()).toBe(false);
  });

  it('rejects configured host names that resolve to a private address before opening a connection', async () => {
    egress.dns.mockResolvedValue(['127.0.0.1']);
    await expect(lookupLocalPrice(product, location, undefined, now)).rejects.toBeInstanceOf(LocalPriceUnavailable);
    expect(egress.dns).toHaveBeenCalled();
    expect(egress.get).not.toHaveBeenCalled();
  });

  it('does not follow redirects from an approved feed', async () => {
    egress.dns.mockResolvedValue(['8.8.8.8']);
    egress.get.mockImplementation((_url, _options, receive) => {
      receive({ statusCode: 302, headers: { location: 'https://another.ng' }, destroy: vi.fn() });
      return { on: vi.fn() };
    });
    await expect(lookupLocalPrice(product, location, undefined, now)).rejects.toBeInstanceOf(LocalPriceUnavailable);
    expect(egress.get).toHaveBeenCalledTimes(2);
    expect(egress.get.mock.calls.map(call => new URL(String(call[0])).hostname)).toEqual(['feed.retail-one.ng', 'feed.retail-two.ng']);
  });
});
