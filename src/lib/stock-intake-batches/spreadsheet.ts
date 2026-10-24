import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import { validateWorkbookArchive } from "../imports/zip-limits";
import { INTAKE_FIELDS, type IntakeField } from "./fields";

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_BATCH_ROWS = 20_000;
export interface SheetSelection {
  name: string;
  headerRow: number;
  columns: Partial<Record<IntakeField, number>>;
}
export interface SpreadsheetPlan {
  sheets: SheetSelection[];
}
export interface SourceCell {
  value: string | number | boolean | null;
  formatted: string;
  formula?: string;
}
export interface PreparedSpreadsheetRow {
  sheet: string;
  row: number;
  cells: Record<string, SourceCell>;
  values: Record<IntakeField, string | number | null>;
  warnings: string[];
}
export interface WorkbookInspection {
  sheets: { name: string; preview: { row: number; cells: SourceCell[] }[] }[];
}

async function readBook(
  name: string,
  bytes: Uint8Array,
  plan?: SpreadsheetPlan,
) {
  if (!/\.(csv|xlsx)$/i.test(name)) throw new Error("Choose CSV or XLSX.");
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES)
    throw new Error("Files must contain data and be no larger than 20 MiB.");
  const workbook = /\.xlsx$/i.test(name);
  if (workbook) {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
      throw new Error("The file is not an XLSX workbook.");
    await validateWorkbookArchive(bytes, (content, maximum) => {
      try {
        return inflateRawSync(content, {
          maxOutputLength: Math.max(1, maximum),
        }).byteLength;
      } catch {
        throw new Error("Workbook expansion exceeds its safe size limit.");
      }
    });
  } else if (bytes.includes(0))
    throw new Error("Choose a text CSV file, not a binary file.");
  const header = plan
    ? Math.max(...plan.sheets.map((sheet) => sheet.headerRow))
    : 0;
  return XLSX.read(bytes, {
    type: "array",
    raw: !workbook,
    cellDates: false,
    cellFormula: true,
    sheetRows: plan ? MAX_BATCH_ROWS + header + 1 : 20,
    ...(plan ? { sheets: plan.sheets.map((sheet) => sheet.name) } : {}),
  });
}

function cellAt(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
): SourceCell {
  const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column })] as
    | XLSX.CellObject
    | undefined;
  const value = cell?.v;
  if (cell?.t === "e")
    return {
      value: null,
      formatted: cell.w ?? "Spreadsheet error",
      formula: cell.f,
    };
  return {
    value:
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "string"
        ? value
        : null,
    formatted: cell ? String(cell.w ?? XLSX.utils.format_cell(cell) ?? "") : "",
    ...(cell?.f ? { formula: cell.f } : {}),
  };
}

export async function inspectSpreadsheet(
  name: string,
  bytes: Uint8Array,
): Promise<WorkbookInspection> {
  const book = await readBook(name, bytes);
  if (!book.SheetNames.length) throw new Error("No worksheets found.");
  return {
    sheets: book.SheetNames.map((name) => {
      const sheet = book.Sheets[name];
      const range = sheet?.["!ref"]
        ? XLSX.utils.decode_range(sheet["!ref"])
        : null;
      if (range && range.e.c >= 200)
        throw new Error(
          "A worksheet exceeds the supported 200-column boundary.",
        );
      return {
        name,
        preview: range
          ? Array.from({ length: Math.min(20, range.e.r + 1) }, (_, index) => ({
              row: index + 1,
              cells: Array.from({ length: range.e.c + 1 }, (_, column) =>
                cellAt(sheet, index + 1, column),
              ),
            }))
          : [],
      };
    }),
  };
}

function numeric(value: SourceCell | undefined, whole: boolean): number | null {
  if (!value || value.value === null || typeof value.value === "boolean")
    return null;
  const raw =
    typeof value.value === "number" ? value.value : value.value.trim();
  if (raw === "" || (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw)))
    return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return null;
  if (whole)
    return Number.isSafeInteger(number) && number > 0 && number <= 2_147_483_647
      ? number
      : null;
  return number <= 9_999_999_999.99 && number === Math.round(number * 100) / 100
    ? number
    : null;
}

/** Emits every selected nonblank data row; checkpoints are bounded, never receipts. */
export async function parseSpreadsheet(
  name: string,
  bytes: Uint8Array,
  plan: SpreadsheetPlan,
  checkpoint: (rows: PreparedSpreadsheetRow[]) => Promise<void>,
) {
  if (
    !plan.sheets.length ||
    new Set(plan.sheets.map((s) => s.name)).size !== plan.sheets.length
  )
    throw new Error("Select each worksheet once.");
  for (const sheet of plan.sheets) {
    if (
      !Number.isInteger(sheet.headerRow) ||
      sheet.headerRow < 1 ||
      sheet.headerRow > MAX_BATCH_ROWS + 1
    )
      throw new Error("Choose a valid header row.");
    if (
      !Object.keys(sheet.columns).every((key) =>
        INTAKE_FIELDS.includes(key as IntakeField),
      ) ||
      !Object.values(sheet.columns).every(
        (column) => Number.isInteger(column) && column! >= 0 && column! < 200,
      )
    )
      throw new Error(
        "Map columns A through GR using their numeric positions.",
      );
    if (
      sheet.columns.quantity === undefined ||
      !["sku", "barcode", "description"].some(
        (key) => sheet.columns[key as IntakeField] !== undefined,
      )
    )
      throw new Error(
        "Map quantity and a product description, SKU or barcode.",
      );
  }
  const book = await readBook(name, bytes, plan);
  let prepared = 0,
    blank = 0;
  let pending: PreparedSpreadsheetRow[] = [];
  const worksheets: { name: string; rows: number; blank: number }[] = [];
  for (const selection of plan.sheets) {
    if (!book.SheetNames.includes(selection.name))
      throw new Error(`Worksheet unavailable: ${selection.name}`);
    const sheet = book.Sheets[selection.name];
    const ref = sheet?.["!fullref"] ?? sheet?.["!ref"];
    const range = ref ? XLSX.utils.decode_range(ref) : null;
    if (
      range &&
      (range.e.r + 1 > MAX_BATCH_ROWS + selection.headerRow || range.e.c >= 200)
    )
      throw new Error(
        "Selected worksheet exceeds 20,000 data-row positions or 200 columns. No truncated result will be accepted.",
      );
    const stats = { name: selection.name, rows: 0, blank: 0 };
    worksheets.push(stats);
    if (!range) continue;
    const header = Array.from(
      { length: range.e.c + 1 },
      (_, column) => cellAt(sheet, selection.headerRow, column).formatted,
    );
    for (let row = selection.headerRow + 1; row <= range.e.r + 1; row++) {
      const original = Array.from({ length: range.e.c + 1 }, (_, column) =>
        cellAt(sheet, row, column),
      );
      if (original.every((cell) => cell.value === null || cell.value === "")) {
        blank++;
        stats.blank++;
        continue;
      }
      if (++prepared > MAX_BATCH_ROWS)
        throw new Error(
          "Selected worksheets exceed 20,000 prepared rows. No truncated result will be accepted.",
        );
      stats.rows++;
      const values = Object.fromEntries(
        INTAKE_FIELDS.map((field) => [field, null]),
      ) as PreparedSpreadsheetRow["values"];
      for (const [field, column] of Object.entries(selection.columns) as [
        IntakeField,
        number,
      ][]) {
        const value = original[column];
        values[field] = [
          "quantity",
          "conversion",
          "receipt_unit_cost",
        ].includes(field)
          ? numeric(value, field !== "receipt_unit_cost")
          : (value?.formatted ?? "").trim() || null;
      }
      const warnings: string[] = [];
      if (original.every((cell, index) => cell.formatted === header[index]))
        warnings.push("Repeated header: review or exclude this row.");
      if (original.some((cell) => cell.formula && cell.value === null))
        warnings.push(
          "A formula has no cached value; enter the value explicitly.",
        );
      if (values.quantity === null)
        warnings.push("Enter a positive whole purchase quantity.");
      if (values.receipt_unit_cost === null)
        warnings.push(
          "Enter the purchase cost; blank and unreadable costs are not zero.",
        );
      const preparedRow = {
        sheet: selection.name,
        row,
        cells: Object.fromEntries(
          original.map((cell, column) => [XLSX.utils.encode_col(column), cell]),
        ),
        values,
        warnings,
      };
      if (Buffer.byteLength(JSON.stringify(preparedRow), "utf8") > 16384)
        throw new Error(
          `Row ${row} in ${selection.name} exceeds the supported 16 KiB review-row boundary.`,
        );
      pending.push(preparedRow);
      if (pending.length === 100) {
        await checkpoint(pending);
        pending = [];
      }
    }
  }
  if (pending.length) await checkpoint(pending);
  if (!prepared) throw new Error("Selected worksheets contain no data rows.");
  return { prepared, blank, worksheets };
}
