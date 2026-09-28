import type { ImportRow } from './preview';
export async function parseImportFile(file: File): Promise<ImportRow[]> {
  if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error('Choose a CSV or XLSX file.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Files must be smaller than 20 MB.');
  const XLSX = await import('xlsx');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('The file has no worksheet.');
  const rows = XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet, { defval: '', raw: true });
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k, v instanceof Date ? v.toISOString() : typeof v === 'number' ? v : String(v ?? '')])));
}
