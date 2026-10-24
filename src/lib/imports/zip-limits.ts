const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const invalid = () => new Error('Could not read the workbook archive. Export a valid XLSX file and try again.');

/** Validate both declared and actual ZIP expansion before SheetJS allocates cells. */
export async function validateWorkbookArchive(bytes: Uint8Array, inflateSize?: (content: Uint8Array, maxBytes: number) => number | Promise<number>): Promise<void> {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end = -1;
  for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--) {
    if(view.getUint32(offset,true)===0x06054b50 && offset+22+view.getUint16(offset+20,true)===bytes.length) { end=offset;break; }
  }
  if(end<0 || view.getUint16(end+4,true)!==0 || view.getUint16(end+6,true)!==0) throw invalid();
  const count=view.getUint16(end+10,true), size=view.getUint32(end+12,true), start=view.getUint32(end+16,true);
  if(!count || count>10000 || start+size!==end || view.getUint16(end+8,true)!==count) throw invalid();
  let cursor=start, expanded=0;
  for(let index=0;index<count;index++) {
    if(cursor+46>end || view.getUint32(cursor,true)!==0x02014b50) throw invalid();
    const flags=view.getUint16(cursor+8,true), method=view.getUint16(cursor+10,true);
    const compressed=view.getUint32(cursor+20,true), declared=view.getUint32(cursor+24,true), local=view.getUint32(cursor+42,true);
    if(flags&1 || ![0,8].includes(method) || declared===0xffffffff || compressed===0xffffffff || local+30>start ||
      view.getUint32(local,true)!==0x04034b50) throw invalid();
    if(expanded+declared>MAX_EXPANDED_BYTES) throw new Error('Workbook expands beyond 64 MiB. Split the workbook; no rows were imported.');
    const dataStart=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if(dataStart+compressed>start) throw invalid();
    let actual=0;
    if(method===0) actual=compressed;
    else if(inflateSize) {
      actual=await inflateSize(bytes.subarray(dataStart,dataStart+compressed),Math.min(declared,MAX_EXPANDED_BYTES-expanded));
    } else {
      if(typeof DecompressionStream==='undefined') throw new Error('This browser cannot validate compressed workbooks. Use CSV or a current browser.');
      const content = new Uint8Array(compressed);
      content.set(bytes.subarray(dataStart,dataStart+compressed));
      const reader=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      try {
        for(;;) {
          const part=await reader.read(); if(part.done) break;
          actual+=part.value.byteLength;
          if(expanded+actual>MAX_EXPANDED_BYTES || actual>declared) throw new Error('Workbook expansion exceeds its safe size limit. No rows were imported.');
        }
      } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
    }
    if(actual!==declared || expanded+actual>MAX_EXPANDED_BYTES) throw invalid();
    expanded+=actual;
    cursor+=46+view.getUint16(cursor+28,true)+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true);
  }
  if(cursor!==end) throw invalid();
}
