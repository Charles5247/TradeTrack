import { describe, expect, it } from "vitest";
import type { ReviewLine } from "./contracts";
import { stockAddition, suggestIntakeColumns } from "./review-display";

const line = {
  product_id: "existing-product",
  product_snapshot: { stock_unit: "piece" },
  quantity: 10,
  purchase_unit: "carton",
  conversion: 12,
} as ReviewLine;

describe("receiving review guidance", () => {
  it("explains the actual proposed pack calculation without claiming approval", () => {
    expect(stockAddition(line)).toBe(
      "10 × 12 stock units per carton = 120 stock units to add",
    );
    expect(stockAddition({ ...line, quantity: 3, conversion: 10 })).toContain(
      "30 stock units to add",
    );
  });

  it("preserves unknown quantities and units and rejects overflow", () => {
    expect(stockAddition({ ...line, quantity: null })).toContain(
      "Enter the quantity",
    );
    expect(stockAddition({ ...line, product_snapshot: undefined })).toContain(
      "stock units",
    );
    expect(stockAddition({ ...line, conversion: 2_147_483_647 })).toContain(
      "outside the supported range",
    );
  });

  it("does not label a rematched product with the previous snapshot's unit", () => {
    expect(
      stockAddition({
        ...line,
        product_id: null,
        new_product: { stock_unit: "bottle" } as NonNullable<
          ReviewLine["new_product"]
        >,
      }),
    ).toContain("120 stock units to add");
  });

  it("suggests the sample workbook columns without requiring eight manual selections", () => {
    expect(
      suggestIntakeColumns([
        "Description",
        "SKU",
        "Quantity",
        "Purchase unit",
        "Conversion",
        "Receipt unit cost",
        "Supplier",
        "Invoice reference",
      ]),
    ).toEqual({
      description: 0,
      sku: 1,
      quantity: 2,
      purchase_unit: 3,
      conversion: 4,
      receipt_unit_cost: 5,
      supplier: 6,
      invoice_reference: 7,
    });
  });

  it("leaves duplicate quantities and ambiguous prices for explicit selection", () => {
    expect(
      suggestIntakeColumns([
        "Description",
        "Qty",
        "Quantity",
        "Price",
        "Total",
        "Unit",
      ]),
    ).toEqual({ description: 0 });
    expect(
      suggestIntakeColumns([" SKU ", "purchase_unit", "receipt-unit-cost"]),
    ).toEqual({ sku: 0, purchase_unit: 1, receipt_unit_cost: 2 });
  });
});
