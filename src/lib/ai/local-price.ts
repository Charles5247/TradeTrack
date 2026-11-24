import 'server-only';
import { Resolver } from 'node:dns/promises';
import { get } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { z } from 'zod';
import {
  koboSchema, localPriceAreaSchema, localPriceCitySchema, NIGERIAN_STATES,
  type LocalPriceArea, type LocalPriceOffer, type LocalPriceResult,
} from './local-price-contract';

const MAX_SOURCES = 5;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_OFFER_AGE = 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT = 7_000;

const feedConfigSchema = z.array(z.object({
  seller: z.string().trim().min(1).max(100),
  url: z.string().max(2048),
  // Set this only after confirming that the feed's offers may be shown and retained.
  approved: z.literal(true),
}).strict()).min(1).max(MAX_SOURCES);

const feedIdentitySchema = z.object({
  name: z.string().trim().min(1).max(255),
  make: z.string().trim().max(100).nullable().optional(),
  barcode: z.string().trim().max(14).nullable().optional(),
  variantSize: z.string().trim().max(100).nullable().optional(),
  variantColour: z.string().trim().max(100).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  stockUnit: z.string().trim().min(1).max(60),
  unitsPerPack: z.number().int().min(1).max(100_000),
}).strict();

export type PriceIdentity = z.infer<typeof feedIdentitySchema>;

const feedOfferSchema = z.object({
  product: feedIdentitySchema,
  area: localPriceAreaSchema,
  priceMinor: koboSchema.refine(value => value !== '0'),
  currency: z.literal('NGN'),
  feeMinor: koboSchema.optional(),
  salesType: z.literal('retail'),
  available: z.literal(true),
  fulfilment: z.enum(['store', 'pickup']),
  url: z.string().max(2048),
  observedAt: z.iso.datetime(),
}).strict();

type PriceFeed = { seller: string; url: URL };
type FeedLoader = (url: URL, signal: AbortSignal) => Promise<unknown>;

const nonPublicIPv4 = new BlockList();
for (const [network, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) nonPublicIPv4.addSubnet(network, bits, 'ipv4');

export class LocalPriceUnavailable extends Error {}

function normalized(value?: string | null) {
  return (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function registeredPriceArea(state?: string | null, city?: string | null): LocalPriceArea | null {
  const key = normalized(state).replace(/\s+state$/, '');
  const canonical = ['abuja', 'fct', 'f.c.t.', 'abuja (fct)', 'federal capital territory (fct)'].includes(key)
    ? 'Federal Capital Territory' as const
    : NIGERIAN_STATES.find(name => normalized(name) === key);
  if (!canonical) return null;
  const locality = localPriceCitySchema.safeParse(city);
  return { state: canonical, ...(locality.success ? { city: locality.data } : {}) };
}

function sourceUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const domain = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash
      || isIP(domain) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
      || /\.(?:local|internal|localhost|test|example|invalid|onion|home|lan)$/.test(domain)) return null;
    return url;
  } catch {
    return null;
  }
}

function readFeeds(config = process.env.AI_LOCAL_PRICE_FEEDS): PriceFeed[] {
  if (!config || config.length > 16_384) return [];
  try {
    const data = feedConfigSchema.parse(JSON.parse(config));
    const hosts = new Set<string>();
    const sellers = new Set<string>();
    const feeds: PriceFeed[] = [];
    for (const item of data) {
      const url = sourceUrl(item.url);
      const seller = normalized(item.seller);
      if (!url || url.search || hosts.has(url.hostname) || sellers.has(seller)) return [];
      feeds.push({ seller: item.seller, url });
      hosts.add(url.hostname);
      sellers.add(seller);
    }
    return feeds;
  } catch {
    return [];
  }
}

export function isLocalPriceSearchEnabled() {
  return readFeeds().length > 0;
}

// Only globally assigned IPv4 addresses are used for production feeds. Pin
// each connection to the validated address while retaining HTTPS hostname checks.
async function fetchApprovedFeed(url: URL, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT, tries: 1 });
  const cancel = () => resolver.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  let addresses: string[];
  try {
    addresses = await resolver.resolve4(url.hostname);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(address => isIP(address) !== 4 || nonPublicIPv4.check(address, 'ipv4')))
    throw new LocalPriceUnavailable();

  return new Promise<unknown>((resolve, reject) => {
    const request = get(url, {
      agent: false,
      family: 4,
      lookup: (_name, _options, callback) => callback(null, addresses[0], 4),
      rejectUnauthorized: true,
      signal,
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
    }, response => {
      const mediaType = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      const encoded = response.headers['content-encoding'];
      // node:https does not follow redirects. It also leaves the body encoded,
      // so reject compressed responses rather than decompressing untrusted data.
      if (response.statusCode !== 200 || mediaType !== 'application/json' || (encoded && encoded !== 'identity')
        || Number(response.headers['content-length']) > MAX_BODY_BYTES) {
        reject(new LocalPriceUnavailable());
        response.destroy();
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
          reject(new LocalPriceUnavailable());
          response.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('aborted', () => reject(new LocalPriceUnavailable()));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new LocalPriceUnavailable());
        }
      });
    });
    request.on('error', reject);
  });
}

// Keep catalog identifiers out of feed requests. A GTIN is used only for local matching.
function gtin(value?: string | null): string | null {
  if (!value || !/^(?:\d{8}|\d{12,14})$/.test(value) || /^0+$/.test(value)) return null;
  const sum = [...value].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0 ? value : null;
}

function matchesProduct(expected: PriceIdentity, offered: PriceIdentity) {
  if (normalized(expected.stockUnit) !== normalized(offered.stockUnit) || expected.unitsPerPack !== offered.unitsPerPack) return false;
  for (const key of ['variantSize', 'variantColour', 'model'] as const) {
    if (normalized(expected[key]) !== normalized(offered[key])) return false;
  }
  const expectedCode = gtin(expected.barcode);
  const offeredCode = gtin(offered.barcode);
  if (expectedCode && offeredCode) return expectedCode.padStart(14, '0') === offeredCode.padStart(14, '0');
  if (expectedCode || offeredCode) return false;
  return normalized(expected.name) === normalized(offered.name) && normalized(expected.make) === normalized(offered.make);
}

const feedEnvelopeSchema = z.object({ offers: z.array(z.unknown()).max(500) }).strict();

async function sellerOffer(feed: PriceFeed, product: PriceIdentity, area: LocalPriceArea, load: FeedLoader, fixedTime?: Date) {
  const query = new URL(feed.url);
  query.searchParams.set('state', area.state);
  const raw = await load(query, AbortSignal.timeout(LOOKUP_TIMEOUT));
  const now = fixedTime ?? new Date();
  const { offers } = feedEnvelopeSchema.parse(raw);
  let best: LocalPriceOffer | undefined;
  for (const entry of offers) {
    const parsed = feedOfferSchema.safeParse(entry);
    if (!parsed.success) continue;
    const offer = parsed.data;
    if (offer.area.state !== area.state || (area.city && normalized(area.city) !== normalized(offer.area.city))
      || !matchesProduct(product, offer.product)) continue;
    const age = now.getTime() - Date.parse(offer.observedAt);
    if (age < 0 || age > MAX_OFFER_AGE) continue;
    const url = sourceUrl(offer.url);
    if (!url || url.origin !== feed.url.origin) continue;
    if (!best || BigInt(offer.priceMinor) < BigInt(best.priceMinor)) {
      best = {
        seller: feed.seller,
        url: url.href,
        priceMinor: offer.priceMinor,
        pack: product.unitsPerPack === 1 ? product.stockUnit : product.stockUnit + ' · ' + product.unitsPerPack + ' per pack',
        location: [offer.area.city, offer.area.state].filter(Boolean).join(', '),
        checkedAt: now.toISOString(),
        ...(offer.feeMinor === undefined ? {} : { feeMinor: offer.feeMinor }),
      };
    }
  }
  return best;
}

export async function lookupLocalPrice(
  product: PriceIdentity,
  area: LocalPriceArea,
  load: FeedLoader = fetchApprovedFeed,
  fixedTime?: Date,
): Promise<LocalPriceResult> {
  // Configuration and identity are validated before any external lookup.
  const feeds = readFeeds();
  if (!feeds.length) throw new LocalPriceUnavailable();
  if (!feedIdentitySchema.safeParse(product).success) return { status: 'no_local_price', area, offers: [] };
  const results = await Promise.allSettled(feeds.map(feed => sellerOffer(feed, product, area, load, fixedTime)));
  if (results.every(result => result.status === 'rejected')) throw new LocalPriceUnavailable();
  const offers = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
    .sort((left, right) => Number(BigInt(left.priceMinor) - BigInt(right.priceMinor)));

  if (offers.length === 0) return { status: 'no_local_price', area, offers: [] };
  if (offers.length === 1) return { status: 'observed', area, offers: [offers[0]] };
  const mid = Math.floor(offers.length / 2);
  const high = BigInt(offers[mid].priceMinor);
  // Round an even median to the nearest whole kobo, with halves rounded up.
  const median = offers.length % 2 ? high : (BigInt(offers[mid - 1].priceMinor) + high + BigInt(1)) / BigInt(2);
  return { status: 'suggested', area, offers, suggestedPriceMinor: median.toString() };
}
