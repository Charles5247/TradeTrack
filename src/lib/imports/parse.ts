import type { ImportRow } from './preview';

export async function parseImportFile(file: File): Promise<ImportRow[]> {
  if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error('Choose a CSV or XLSX file.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Files must be no larger than 20 MiB.');
  if (!file.size) throw new Error('The file is empty.');
  const bytes = await file.arrayBuffer();
  // Node tests have no browser Worker. Production parsing stays off the UI thread.
  if (typeof Worker === 'undefined') {
    if(typeof window!=='undefined') throw new Error('This browser cannot safely process spreadsheets. Use a current browser.');
    const { parseImportBytes } = await import('./parse-core');
    return parseImportBytes(file.name,new Uint8Array(bytes));
  }
  return new Promise<ImportRow[]>((resolve,reject) => {
    const worker = new Worker(new URL('./parse.worker.ts',import.meta.url),{type:'module'});
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    const timeout = setTimeout(() => { finish(); reject(new Error('Spreadsheet processing timed out. Split the file and retry; no rows were imported.')); },45000);
    worker.onmessage = (event: MessageEvent<{ rows?: ImportRow[]; error?: string }>) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else if (Array.isArray(event.data.rows)) resolve(event.data.rows);
      else reject(new Error('Spreadsheet worker returned an incomplete result.'));
    };
    worker.onerror = () => { finish(); reject(new Error('Spreadsheet processing failed. Retry the file; no rows were imported.')); };
    worker.postMessage({name:file.name,bytes},[bytes]);
  });
}
