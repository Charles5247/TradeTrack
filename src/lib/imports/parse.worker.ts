import { parseImportBytes } from './parse-core';

globalThis.onmessage = async (event: MessageEvent<{ name: string; bytes: ArrayBuffer }>) => {
  try {
    globalThis.postMessage({ rows: await parseImportBytes(event.data.name,new Uint8Array(event.data.bytes)) });
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : 'Could not read the spreadsheet.' });
  }
};
