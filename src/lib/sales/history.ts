export type SalesSource = 'all' | 'trackasuwa' | 'imported';

export interface ImportedSaleRow {
  id: string;
  invoice_number: string;
  sold_at: string;
  created_at: string;
  total: number;
  amount_paid: number;
  payment_method: string;
  status: 'active' | 'reversed';
  source: 'imported';
}

export interface TracKasuwaSaleRow {
  id: string;
  created_at: string;
  source: 'trackasuwa';
  [key: string]: unknown;
}

export type SalesHistoryRow = ImportedSaleRow | TracKasuwaSaleRow;

export function mergeSalesHistory(live: Array<{ id: string; created_at: string; [key: string]: unknown }>, imported: Omit<ImportedSaleRow, 'source' | 'created_at'>[], source: SalesSource): SalesHistoryRow[] {
  const liveRows = source === 'imported' ? [] : live.map(row => ({ ...row, source: 'trackasuwa' as const }));
  const importedRows = source === 'trackasuwa' ? [] : imported
    .filter(row => row.status !== 'reversed')
    .map(row => ({ ...row, created_at: row.sold_at, source: 'imported' as const }));
  return ([...liveRows, ...importedRows] as SalesHistoryRow[]).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}
