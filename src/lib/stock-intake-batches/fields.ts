export const INTAKE_FIELDS = [
  "description",
  "sku",
  "barcode",
  "quantity",
  "purchase_unit",
  "conversion",
  "receipt_unit_cost",
  "supplier",
  "invoice_reference",
] as const;
export type IntakeField = (typeof INTAKE_FIELDS)[number];
