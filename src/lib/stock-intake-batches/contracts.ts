import { z } from "zod";
import type { IntakeLine } from "../stock-intake/contracts";
import type {
  PreparedSpreadsheetRow,
  SpreadsheetPlan,
  WorkbookInspection,
} from "./spreadsheet";
import { INTAKE_FIELDS } from "./fields";
import { STOCK_UNITS } from "../industries";
export { INTAKE_FIELDS } from "./fields";

const id = z.guid();
const revision = z.number().int().positive();
const cost = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine(
    (value) => value === Math.round(value * 100) / 100,
    "Use at most two decimal places",
  );
const selection = z
  .object({
    name: z.string().min(1).max(255),
    headerRow: z.number().int().min(1).max(20001),
    columns: z.partialRecord(
      z.enum(INTAKE_FIELDS),
      z.number().int().min(0).max(199),
    ),
  })
  .strict();
export const batchPlanSchema = z
  .object({ sheets: z.array(selection).min(1).max(10000) })
  .strict();
const documentDraft = z
  .object({
    draft_id: id,
    name: z.string().max(255),
    sku: z.string().max(100),
    barcode: z.string().max(100),
    stock_unit: z.enum(STOCK_UNITS).default("piece"),
    cost_price: cost.nullable(),
    selling_price: cost.nullable(),
    confirmed: z.boolean(),
  })
  .strict();
const reviewPatch = z
  .object({
    product_id: id.nullable().optional(),
    draft_id: id.nullable().optional(),
    quantity: z.number().int().min(1).max(2147483647).nullable().optional(),
    purchase_unit: z.string().max(40).optional(),
    conversion: z.number().int().min(1).max(2147483647).nullable().optional(),
    conversion_confirmed: z.boolean().optional(),
    receipt_unit_cost: cost.nullable().optional(),
  })
  .strict();
const common = { batch_id: id, expected_revision: revision };
export const batchCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      id,
      mode: z.enum(["opening_stock", "additional_delivery"]),
      warehouse_id: id,
    })
    .strict(),
  z
    .object({
      action: z.literal("register"),
      ...common,
      source: z
        .object({
          id,
          name: z
            .string()
            .min(1)
            .max(255)
            .regex(/\.(csv|xlsx)$/i),
          bytes: z
            .number()
            .int()
            .positive()
            .max(20 * 1024 * 1024),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ action: z.literal("uploaded"), batch_id: id, source_id: id })
    .strict(),
  z
    .object({
      action: z.literal("configure"),
      ...common,
      source_id: id,
      plan: batchPlanSchema,
      duplicate_reason: z.string().max(500).default(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("source_exclude"),
      ...common,
      source_id: id,
      excluded: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("process"), ...common }).strict(),
  z
    .object({
      action: z.literal("rows"),
      ...common,
      ids: z.array(id).min(1).max(20000),
      patch: reviewPatch,
      group_id: id.optional(),
      excluded: z.boolean().optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("draft"), ...common, document: documentDraft })
    .strict(),
  z
    .object({
      action: z.literal("group"),
      ...common,
      group_id: id,
      label: z.string().min(1).max(255),
      warehouse_id: id,
      supplier: z.string().max(255),
      invoice_reference: z.string().max(100),
      duplicate_reason: z.string().max(500),
      excluded: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("prepare"),
      ...common,
      group_ids: z.array(id).min(1).max(20000),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve"),
      ...common,
      approval_id: id,
      receipts: z
        .array(
          z
            .object({ group_id: id, hash: z.string().regex(/^[a-f0-9]{64}$/) })
            .strict(),
        )
        .min(1)
        .max(20000),
      exclusions_acknowledged: z.literal(true),
    })
    .strict(),
  z.object({ action: z.literal("retry"), ...common }).strict(),
  z.object({ action: z.literal("cancel"), ...common }).strict(),
]);
export type BatchCommand = z.input<typeof batchCommandSchema>;
export interface BatchHeader {
  id: string;
  organization_id: string;
  created_by: string;
  revision: number;
  mode: "opening_stock" | "additional_delivery";
  warehouse_id: string;
  status:
    | "draft"
    | "processing"
    | "review"
    | "posting"
    | "completed"
    | "partial"
    | "cancelled";
  approval_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface BatchSource {
  id: string;
  name: string;
  bytes: number;
  sha256: string;
  object_key: string;
  version: number;
  status:
    | "uploading"
    | "queued"
    | "inspecting"
    | "select_sheets"
    | "parsing"
    | "prepared"
    | "failed";
  inspection: WorkbookInspection | null;
  plan: SpreadsheetPlan | null;
  stats: { prepared: number; blank: number } | null;
  error: string | null;
  excluded: boolean;
  duplicate_reason: string;
  duplicate?: boolean;
  sheet_count?: number;
}
export type ReviewLine = Omit<
  IntakeLine,
  | "quantity"
  | "conversion"
  | "conversion_confirmed"
  | "receipt_unit_cost"
  | "new_product"
> & {
  quantity: number | null;
  conversion: number | null;
  conversion_confirmed: boolean;
  receipt_unit_cost: number | null;
  new_product: z.infer<typeof documentDraft> | null;
};
export interface BatchRow {
  id: string;
  source_id: string;
  source_name: string;
  sheet: string;
  row_number: number;
  raw: PreparedSpreadsheetRow;
  review: ReviewLine;
  warnings: string[];
  issues: string[];
  group_id: string;
  excluded: boolean;
  source_excluded: boolean;
  draft_id: string | null;
  draft_appearances: number;
  group_status: BatchGroup["status"];
}
export interface BatchGroup {
  id: string;
  label: string;
  warehouse_id: string;
  supplier: string;
  invoice_reference: string;
  duplicate_reason: string;
  status:
    | "review"
    | "preparing"
    | "ready"
    | "posting"
    | "posted"
    | "needs_review";
  revision: number;
  excluded: boolean;
  receipt_id: string | null;
  prepared_hash: string | null;
  error: string | null;
  row_count: number;
  receipt_cost_total: string | null;
  prepared_currency: string | null;
  result: { posted_at: string; line_count: number } | null;
}
export interface BatchView {
  batch: BatchHeader;
  sources: BatchSource[];
  groups: BatchGroup[];
  rows: BatchRow[];
  row_count: number;
  group_count: number;
  next_row_offset: number | null;
  next_group_offset: number | null;
  summary: {
    files: number;
    bytes: number;
    prepared_rows: number;
    ready: number;
    posted: number;
    needs_review: number;
    excluded: number;
    failed_sources: number;
    jobs_active: number;
    currency: string;
  };
}
export const jobSourceSchema = z.object({
  id,
  name: z.string(),
  bytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  object_key: z.string(),
  version: z.number().int(),
  plan: batchPlanSchema.nullable(),
});
export const jobSchema = z.object({
  id,
  organization_id: id,
  batch_id: id,
  actor_id: id,
  stage: z.enum(["inspect", "parse", "prepare", "post"]),
  source_id: id.nullable(),
  group_id: id.nullable(),
  content_revision: z.number().int(),
  processing_version: z.number().int(),
  lease_token: id,
  attempts: z.number().int(),
  source: jobSourceSchema.nullable(),
});
export type IntakeJob = z.infer<typeof jobSchema>;
