import { z } from 'zod';
import { stockReviewIdSchema } from './stock-review-contract';

const operationId = stockReviewIdSchema;
const rowIndex = z.number().int().nonnegative().max(2147483647);
const priceMinor = z.string().regex(/^(?:0|[1-9][0-9]{0,11})$/);
const reviewDigest = z.string().regex(/^[a-f0-9]{64}$/);

export const priceChangeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), operationId, job: stockReviewIdSchema,
    rowIndex, newPriceMinor: priceMinor }).strict(),
  z.object({ action: z.literal('approve'), operationId, reviewDigest }).strict(),
  z.object({ action: z.literal('status'), operationId }).strict(),
]);

export const priceChangeResultSchema = z.object({
  operationId,
  job: stockReviewIdSchema,
  rowIndex,
  productId: stockReviewIdSchema,
  productName: z.string(),
  oldPriceMinor: priceMinor,
  newPriceMinor: priceMinor,
  reviewDigest,
  status: z.enum(['prepared', 'completed', 'conflict', 'expired']),
  expiresAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
}).strict().refine(result => (result.status === 'completed') === (result.completedAt !== null));

export type PriceChangeResult = z.infer<typeof priceChangeResultSchema>;
