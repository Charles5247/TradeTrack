import { z } from "zod";
// Match PostgreSQL's UUID shape, including identifiers created by legacy imports.

const price = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine(
    (value) => value === Math.round(value * 100) / 100,
    "Use at most two decimal places",
  );
const quantity = z.number().int().positive().max(2_147_483_647);
export const newProductSchema = z.object({
  draft_id: z.guid(),
  name: z.string().trim().min(1).max(255),
  sku: z.string().trim().min(1).max(100),
  barcode: z.string().trim().max(100).default(""),
  selling_price: price,
  cost_price: price,
  confirmed: z.literal(true, {
    error: "Review and confirm the new product identity and catalog prices",
  }),
});
export const intakeLineSchema = z
  .object({
    id: z.guid(),
    product_id: z.guid().nullable(),
    new_product: newProductSchema.nullable(),
    quantity,
    purchase_unit: z.string().trim().min(1).max(40),
    conversion: quantity,
    conversion_confirmed: z.literal(true, {
      error: "Confirm this line's purchase-unit conversion",
    }),
    receipt_unit_cost: price,
    product_snapshot: z
      .object({
        name: z.string(),
        sku: z.string(),
        barcode: z.string().nullable(),
        make: z.string().nullable(),
        status: z.string(),
      })
      .optional(),
    stock_units: quantity.optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (line) => Boolean(line.product_id) !== Boolean(line.new_product),
    "Select a product or review one new product draft",
  )
  .refine(
    (line) => line.quantity * line.conversion <= 2_147_483_647,
    "Converted stock quantity exceeds the integer limit",
  );
export const intakeDocumentSchema = z
  .object({
    mode: z.enum(["opening_stock", "additional_delivery"]),
    warehouse_id: z.guid(),
    supplier: z.string().trim().max(255).default(""),
    invoice_reference: z.string().trim().max(100).default(""),
    notes: z.string().max(2000).default(""),
    duplicate_reason: z.string().trim().max(500).default(""),
    currency: z.string().length(3).optional(),
    lines: z.array(intakeLineSchema).min(1).max(1000),
    receipt_cost_total: price.optional(),
  })
  .superRefine((document, context) => {
    if (
      new Set(document.lines.map((line) => line.id)).size !==
      document.lines.length
    )
      context.addIssue({ code: "custom", message: "Line IDs must be unique" });
    const total = document.lines.reduce(
      (sum, line) =>
        sum + Math.round(line.receipt_unit_cost * 100) * line.quantity,
      0,
    );
    if (total > 999_999_999_999)
      context.addIssue({
        code: "custom",
        message: "Receipt cost exceeds supported precision",
      });
  });
export type IntakeDocument = z.infer<typeof intakeDocumentSchema>;
export type IntakeLine = z.infer<typeof intakeLineSchema>;
export interface IntakeResult {
  receipt_id: string;
  approval_id: string;
  status: "posted";
  receipt_cost_total: number;
  posted_at: string;
  stocks: {
    id: string;
    product_id: string;
    warehouse_id: string;
    quantity: number;
    added: number;
  }[];
  lines: { line_id: string; product_id: string; stock_units: number }[];
}
export interface IntakeReceipt {
  id: string;
  organization_id: string;
  created_by: string;
  revision: number;
  status: "draft" | "approved" | "posted";
  document: IntakeDocument;
  payload_hash: string;
  approval_id: string | null;
  invoice_fingerprint: string | null;
  result: IntakeResult | null;
  created_at: string;
  updated_at: string;
  current_stock?: { product_id: string; quantity: number }[] | null;
  stock_warning?: string | null;
}
export interface IntakeProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  make: string | null;
  status: string;
  cost_price: number;
  selling_price: number;
}
export interface IntakeCatalog {
  products: IntakeProduct[];
  hasMore: boolean;
  nextOffset: number | null;
  warehouses: { id: string; name: string }[];
}
export const intakeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.guid(),
    revision: z.number().int().min(0),
    document: intakeDocumentSchema,
  }),
  z.object({
    action: z.literal("approve"),
    id: z.guid(),
    revision: z.number().int().positive(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ action: z.literal("post"), id: z.guid(), approval_id: z.guid() }),
]);
