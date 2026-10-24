import type { ImportRow } from './preview';
import { validateWorkbookArchive } from './zip-limits';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_WORKSHEET_ROWS = 20_001; // Includes the header; selected-sheet intake is added in M2.

export async function parseImportBytes(name: string, bytes: Uint8Array): Promise<ImportRow[]> {
  if (!/\.(csv|xlsx)$/i.test(name)) throw new Error('Choose a CSV or XLSX file.');
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('Files must be no larger than 20 MiB.');
  if (!bytes.byteLength) throw new Error('The file is empty.');

  const isWorkbook = /\.xlsx$/i.test(name);
  if (isWorkbook && !(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    throw new Error('The file is not a valid XLSX workbook.');
  }
  if (!isWorkbook && bytes.includes(0)) throw new Error('Choose a text CSV file, not a binary file.');
  if (isWorkbook) await validateWorkbookArchive(bytes);

  const XLSX = await import('xlsx');
  let book: ReturnType<typeof XLSX.read>;
  try {
    book = XLSX.read(bytes, { type: 'array', cellDates: true, sheetRows: MAX_WORKSHEET_ROWS + 1 });
  } catch {
    throw new Error('Could not read the spreadsheet. Export a valid CSV or XLSX file and try again.');
  }
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('The file has no worksheet.');
  // sheetRows bounds parsing; !fullref detects omitted rows instead of treating
  // a bounded parser response as a complete import.
  const reference = sheet['!fullref'] || sheet['!ref'];
  if (reference && XLSX.utils.decode_range(reference).e.r >= MAX_WORKSHEET_ROWS) {
    throw new Error('This worksheet exceeds 20,000 data rows. Split the file; no rows were imported.');
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
  if (!rows.length) throw new Error('The worksheet contains no data rows.');
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value instanceof Date ? value.toISOString() : typeof value === 'number' ? value : String(value ?? ''),
  ])));
}
