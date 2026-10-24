import { describe, expect, it } from "vitest";
import { intakeDocumentSchema } from "./contracts";

function document(cost: unknown) {
  return {
    mode: "additional_delivery",
    warehouse_id: "22222222-2222-4222-8222-222222222222",
    lines: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        product_id: "33333333-3333-4333-8333-333333333333",
        new_product: null,
        quantity: 1,
        purchase_unit: "unit",
        conversion: 1,
        conversion_confirmed: true,
        receipt_unit_cost: cost,
      },
    ],
  };
}
describe("receipt purchase-cost boundary", () => {
  it("accepts every two-decimal cent at the numeric upper boundary without floating-point false rejections", () => {
    for (let cents = 0; cents < 100; cents++) {
      const value = Number(`9999999999.${String(cents).padStart(2, "0")}`);
      const parsed = intakeDocumentSchema.parse(document(value));
      expect(parsed.lines[0].receipt_unit_cost).toBe(value);
    }
    expect(
      intakeDocumentSchema.parse(document(0.29)).lines[0].receipt_unit_cost,
    ).toBe(0.29);
    expect(
      intakeDocumentSchema.parse(document(0)).lines[0].receipt_unit_cost,
    ).toBe(0);
  });
  it("rejects missing, nonfinite, negative and extra-decimal costs instead of replacing or rounding them", () => {
    for (const value of [
      undefined,
      null,
      NaN,
      Infinity,
      -0.01,
      0.291,
      0.1 + 0.2,
    ])
      expect(intakeDocumentSchema.safeParse(document(value)).success).toBe(
        false,
      );
  });
});
