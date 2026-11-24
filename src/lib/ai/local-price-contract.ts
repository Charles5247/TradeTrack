import { z } from 'zod';

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'Federal Capital Territory', 'Gombe', 'Imo', 'Jigawa', 'Kaduna',
  'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
] as const;

export const localPriceCitySchema = z.string().trim().min(2).max(64)
  .regex(/^\p{L}[\p{L}\p{M} .’'-]*$/u);

export const localPriceAreaSchema = z.object({
  state: z.enum(NIGERIAN_STATES),
  city: localPriceCitySchema.optional(),
}).strict();

export type LocalPriceArea = z.infer<typeof localPriceAreaSchema>;

export const localPriceRequestSchema = z.object({
  productId: z.uuid(),
  warehouseId: z.uuid(),
  area: localPriceAreaSchema,
}).strict();

export const localPriceDefaultSchema = z.object({ area: localPriceAreaSchema.nullable() }).strict();
export const koboSchema = z.string().regex(/^(0|[1-9]\d{0,11})$/);
const positiveKoboSchema = koboSchema.refine(value => value !== '0');

const localPriceOfferSchema = z.object({
  seller: z.string().min(1).max(100),
  url: z.url({ protocol: /^https$/ }),
  priceMinor: positiveKoboSchema,
  pack: z.string().min(1).max(100),
  location: z.string().min(1).max(100),
  checkedAt: z.iso.datetime(),
  feeMinor: koboSchema.optional(),
}).strict();

export type LocalPriceOffer = z.infer<typeof localPriceOfferSchema>;

export const localPriceResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('suggested'),
    area: localPriceAreaSchema,
    offers: z.array(localPriceOfferSchema).min(2).max(5),
    suggestedPriceMinor: positiveKoboSchema,
  }).strict(),
  z.object({
    status: z.literal('observed'),
    area: localPriceAreaSchema,
    offers: z.tuple([localPriceOfferSchema]),
  }).strict(),
  z.object({
    status: z.literal('no_local_price'),
    area: localPriceAreaSchema,
    offers: z.tuple([]),
  }).strict(),
]);

export type LocalPriceResult = z.infer<typeof localPriceResultSchema>;
