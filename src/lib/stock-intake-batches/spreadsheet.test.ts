import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  inspectSpreadsheet,
  parseSpreadsheet,
  type PreparedSpreadsheetRow,
} from "./spreadsheet";

const bytes = (sheets: Record<string, unknown[][]>) => {
  const book = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), name);
  return new Uint8Array(
    XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }),
  );
};
const columns = { sku: 0, quantity: 1, receipt_unit_cost: 2 } as const;
describe("complete selected spreadsheet preparation", () => {
  it("inspects every sheet and prepares both selected sheets beyond 1000 rows with original row references", async () => {
    const input = bytes({
      First: [
        ["SKU", "Qty", "Cost"],
        ...Array.from({ length: 700 }, (_, n) => [`A-${n}`, 1, 0]),
      ],
      Second: [
        ["SKU", "Qty", "Cost"],
        ...Array.from({ length: 700 }, (_, n) => [`B-${n}`, 2, 1.25]),
      ],
      Unselected: [
        ["SKU", "Qty"],
        ["OTHER", 99],
      ],
    });
    expect(
      (await inspectSpreadsheet("stock.xlsx", input)).sheets.map((s) => s.name),
    ).toEqual(["First", "Second", "Unselected"]);
    const rows: PreparedSpreadsheetRow[] = [];
    const result = await parseSpreadsheet(
      "stock.xlsx",
      input,
      {
        sheets: [
          { name: "First", headerRow: 1, columns },
          { name: "Second", headerRow: 1, columns },
        ],
      },
      async (chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(100);
        rows.push(...chunk);
      },
    );
    expect(result.prepared).toBe(1400);
    expect(rows[1000]).toMatchObject({
      sheet: "Second",
      row: 302,
      values: { sku: "B-300", quantity: 2, receipt_unit_cost: 1.25 },
    });
    expect(rows[0].values.receipt_unit_cost).toBe(0);
    expect(rows.at(-1)).toMatchObject({ sheet: "Second", row: 701 });
  });
  it("retains repeated headers and missing or fractional values as review exceptions rather than stock or zero costs", async () => {
    const rows: PreparedSpreadsheetRow[] = [];
    await parseSpreadsheet(
      "stock.csv",
      new TextEncoder().encode(
        "SKU,Qty,Cost\n00123,3,\nSKU,Qty,Cost\n00456,1.5,0\n",
      ),
      { sheets: [{ name: "Sheet1", headerRow: 1, columns }] },
      async (chunk) => {
        rows.push(...chunk);
      },
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].values).toMatchObject({
      sku: "00123",
      quantity: 3,
      receipt_unit_cost: null,
    });
    expect(rows[1].warnings.join(" ")).toMatch(/Repeated header/);
    expect(rows[2].values).toMatchObject({
      sku: "00456",
      quantity: null,
      receipt_unit_cost: 0,
    });
  });
  it("accepts all 20000 rows and explicitly rejects a 20001st selected row", async () => {
    const book = bytes({
      Stock: [
        ["SKU", "Qty", "Cost"],
        ...Array.from({ length: 20000 }, (_, n) => [`S${n}`, 1, 1]),
      ],
    });
    let count = 0;
    expect(
      (
        await parseSpreadsheet(
          "stock.xlsx",
          book,
          { sheets: [{ name: "Stock", headerRow: 1, columns }] },
          async (rows) => {
            count += rows.length;
          },
        )
      ).prepared,
    ).toBe(20000);
    expect(count).toBe(20000);
    const overflow = new TextEncoder().encode(
      "SKU,Qty,Cost\n" +
        Array.from({ length: 20001 }, () => "S,1,1").join("\n"),
    );
    await expect(
      parseSpreadsheet(
        "stock.csv",
        overflow,
        { sheets: [{ name: "Sheet1", headerRow: 1, columns }] },
        async () => {},
      ),
    ).rejects.toThrow(/20,000/);
  });
  it("refuses an absent selected worksheet without substituting another sheet", async () => {
    const input = bytes({
      Actual: [
        ["SKU", "Qty", "Cost"],
        ["A", 1, 1],
      ],
    });
    await expect(
      parseSpreadsheet(
        "stock.xlsx",
        input,
        { sheets: [{ name: "Missing", headerRow: 1, columns }] },
        async () => {},
      ),
    ).rejects.toThrow(/unavailable/);
  });
});
