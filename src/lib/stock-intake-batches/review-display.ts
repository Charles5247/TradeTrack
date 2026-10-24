import type { ReviewLine } from "./contracts";
import { INTAKE_FIELDS, type IntakeField } from "./fields";

export const intakeFieldLabels: Record<IntakeField, string> = {
  description: "Product name",
  sku: "SKU / product code",
  barcode: "Barcode",
  quantity: "Number of packs received",
  purchase_unit: "Pack type (e.g. carton or piece)",
  conversion: "Stock units in each pack",
  receipt_unit_cost: "Cost of one received pack",
  supplier: "Supplier",
  invoice_reference: "Invoice number",
};

export const reviewIssueLabels: Record<string, string> = {
  products: "Choose or confirm the product",
  quantities: "Enter the quantity received",
  costs: "Enter the purchase cost",
  conversions: "Check the pack size and confirm it",
};

/** Show the proposed stock addition without suggesting it has been confirmed. */
export function stockAddition(line: ReviewLine): string {
  // A stored product snapshot may predate a merchant's rematch. Do not label
  // the new calculation with the previous product's unit.
  const stockUnit = "stock units";
  const pack = line.purchase_unit.trim() || "pack";
  if (line.quantity === null || line.conversion === null)
    return "Enter the quantity and units per pack to see how much stock will be added.";
  const total = line.quantity * line.conversion;
  if (!Number.isSafeInteger(total) || total < 1 || total > 2_147_483_647)
    return "Check the quantity and pack size: the resulting stock quantity is outside the supported range.";
  return `${line.quantity.toLocaleString("en-NG")} × ${line.conversion.toLocaleString("en-NG")} ${stockUnit} per ${pack} = ${total.toLocaleString("en-NG")} ${stockUnit} to add`;
}

const aliases: Record<IntakeField, string[]> = {
  description: [
    "description",
    "product name",
    "product",
    "item",
    "item description",
  ],
  sku: ["sku", "product code", "item code"],
  barcode: ["barcode", "ean", "upc"],
  quantity: ["quantity", "qty", "quantity received"],
  purchase_unit: ["purchase unit", "pack type"],
  conversion: [
    "conversion",
    "units per pack",
    "stock units per pack",
    "pack size",
  ],
  receipt_unit_cost: [
    "receipt unit cost",
    "purchase unit cost",
    "cost per pack",
  ],
  supplier: ["supplier", "supplier name"],
  invoice_reference: ["invoice reference", "invoice number", "invoice no"],
};

/** Suggest only uniquely named columns. Ambiguous headings stay for manual review. */
export function suggestIntakeColumns(headers: string[]) {
  const normalized = headers.map((header) =>
    header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "),
  );
  const columns: Partial<Record<IntakeField, number>> = {};
  for (const field of INTAKE_FIELDS) {
    const matches = normalized.flatMap((header, index) =>
      aliases[field].includes(header) ? [index] : [],
    );
    if (matches.length === 1) columns[field] = matches[0];
  }
  return columns;
}
