import { z } from 'zod';

// The browser supplies draft values. Identity, revisions, executable effects,
// dependencies, digests and approval records are issued by the application.
// PostgreSQL UUIDs also include existing digest-derived identities. Validate
// their stored shape without imposing RFC version/variant bits retroactively.
export const stockReviewIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const id = stockReviewIdSchema;
const index = z.number().int().nonnegative();
const revision = z.number().int().positive();
export const reviewRowSchema = z.object({
  row_index: index, mode: z.enum(['existing', 'new']),
  product_id: z.string().nullable(), warehouse_id: z.string().nullable(),
  quantity: z.string().nullable(), unit_cost: z.string().nullable(), zero_confirmed: z.boolean(),
  name: z.string(), sku: z.string(), stock_unit: z.string(), selling_price: z.string().nullable(),
}).strict();
export type ReviewRowInput = z.infer<typeof reviewRowSchema>;

export const serverReviewSchema = z.object({ revision, rows: z.array(reviewRowSchema) }).strict();
export type ServerStockReview = z.infer<typeof serverReviewSchema>;

export const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save_review'), job: id, expected_revision: revision.nullable(), rows: z.array(reviewRowSchema).min(1) }).strict(),
  z.object({ action: z.literal('preview_selection'), job: id, revision, row_indices: z.array(index).min(1), physical_received: z.literal(true) }).strict(),
  z.object({ action: z.literal('approve_selection'), job: id, selection_id: id, revision,
    review_digest: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.literal(true) }).strict(),
  z.object({ action: z.literal('execute_reviewed'), job: id, approval_id: id, row_index: index }).strict(),
  z.object({ action: z.literal('close_review'), job: id, expected_revision: revision.nullable() }).strict(),
]);
export type StockReviewAction = z.infer<typeof reviewActionSchema>;

const minor = z.string().regex(/^\d+$/);
export const selectionGroupSchema = z.object({
  row_index: index, operation_id: id, receipt_id: id, mode: z.enum(['existing', 'new']),
  product_id: id.nullable(), warehouse_id: id, product_name: z.string(), warehouse_name: z.string(),
  stock_unit: z.string(), quantity: z.number().int().positive(), cost_kind: z.enum(['paid', 'free']),
  unit_cost_minor: minor, selling_price_minor: minor.nullable(),
  stock_before: z.number().int().nonnegative(), stock_after: z.number().int().positive(),
  cost_before_minor: minor, cost_after_minor: minor,
}).strict();
export type StockSelectionGroup = z.infer<typeof selectionGroupSchema>;

export const selectionSchema = z.object({
  selection_id: id, revision, review_digest: z.string().regex(/^[a-f0-9]{64}$/), expires_at: z.string(),
  groups: z.array(selectionGroupSchema).min(1),
}).strict();
export type StockSelection = z.infer<typeof selectionSchema>;

export const approvalSchema = z.object({
  approval_id: id, selection_id: id, revision, review_digest: z.string().regex(/^[a-f0-9]{64}$/),
  row_indices: z.array(index), approved_at: z.string(), expires_at: z.string(),
}).strict();
export type StockApproval = z.infer<typeof approvalSchema>;

export const executionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('completed'), row_index: index, operation_id: id, receipt_id: id,
    product_id: id, average_cost: z.union([z.number(), z.string()]) }).strict(),
  z.object({ status: z.literal('no_effect'), row_index: index, operation_id: id, receipt_id: id,
    code: z.string(), message: z.string(), changes: z.array(z.object({
      field: z.string(), reviewed: z.unknown(), current: z.unknown(),
    })).optional() }).strict(),
]);
export type StockExecution = z.infer<typeof executionSchema>;

export const sourceSchema = z.object({
  kind: z.enum(['text', 'csv', 'xlsx', 'image', 'audio', 'legacy']), hash: z.string().nullable(),
  byte_length: z.number().int().nonnegative().nullable(), text: z.string().nullable(),
  evidence_available: z.boolean(),
}).strict();
export type StockSource = z.infer<typeof sourceSchema>;

export const recordedReceiptSchema = z.object({
  row_index: index, product_id: id, warehouse_id: id, quantity: z.number().int().positive(),
  unit_cost: z.union([z.number(), z.string()]), average_cost: z.union([z.number(), z.string()]).optional(),
  created_product: z.boolean(), approved_product: z.object({
    name: z.string(), sku: z.string(), stock_unit: z.string(), selling_price: z.union([z.number(), z.string()]),
  }).nullable(),
});

export const reviewedOperationSchema = z.object({
  approval_id: id, selection_id: id, revision, row_index: index, operation_id: id, receipt_id: id,
  review_digest: z.string().regex(/^[a-f0-9]{64}$/), expires_at: z.string(), row: reviewRowSchema,
  status: z.enum(['approved', 'completed', 'no_effect']), result: executionSchema.nullable(),
}).strict();
export type ReviewedStockOperation = z.infer<typeof reviewedOperationSchema>;

export const reviewSnapshotSchema = z.object({
  job: id, rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  receipts: z.array(recordedReceiptSchema), review: serverReviewSchema.nullable(), source: sourceSchema,
  operations: z.array(reviewedOperationSchema),
}).strict();
export type StockReviewSnapshot = z.infer<typeof reviewSnapshotSchema>;

// Business errors before a known no-effect result are not proof of rollback.
// Only an execution result stamped no_effect may unlock an attempted row.
export class StockReviewRequestError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'StockReviewRequestError'; }
}
