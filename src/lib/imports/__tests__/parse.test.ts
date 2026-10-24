import { expect, it } from 'vitest';
import { parseImportFile } from '../parse';
import * as XLSX from 'xlsx';
it('parses quoted CSV and Excel workbooks with the existing parser',async()=>{
 const csv=new File(['Name,SKU,Price\n"Rice, bag",RICE,100\n'],'products.csv');
 expect((await parseImportFile(csv))[0]).toMatchObject({Name:'Rice, bag',SKU:'RICE',Price:100});
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Name:'Beans',Qty:5}]),'Products');
 const file=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'products.xlsx');
 expect((await parseImportFile(file))[0]).toEqual({Name:'Beans',Qty:5});
});
it('rejects unsupported file types',async()=>{
 await expect(parseImportFile(new File(['data'],'script.js'))).rejects.toThrow('CSV or XLSX');
});

it('rejects empty, oversized, mislabeled and malformed files before preparing rows', async () => {
  await expect(parseImportFile(new File([], 'empty.csv'))).rejects.toThrow('empty');
  const oversized = new File(['x'], 'large.csv');
  Object.defineProperty(oversized, 'size', { value: 20 * 1024 * 1024 + 1 });
  await expect(parseImportFile(oversized)).rejects.toThrow('20 MiB');
  await expect(parseImportFile(new File(['Name,Qty\nRice,1'], 'fake.xlsx'))).rejects.toThrow('valid XLSX');
  await expect(parseImportFile(new File([new Uint8Array([0x50, 0x4b, 3, 4, 0])], 'broken.xlsx'))).rejects.toThrow('Could not read');
  await expect(parseImportFile(new File([new Uint8Array([0, 1, 2])], 'binary.csv'))).rejects.toThrow('text CSV');
});

it('reports a worksheet over the row limit rather than silently truncating it', async () => {
  const rows = ['Name,Qty', ...Array.from({ length: 20_001 }, (_, index) => `Product ${index},1`)];
  await expect(parseImportFile(new File([rows.join('\n')], 'too-many.csv'))).rejects.toThrow('no rows were imported');
}, 30000);

it('preserves zero values and treats dangerous headings as data without changing prototypes', async () => {
  const rows = await parseImportFile(new File(['Name,Qty,__proto__\nRice,0,untrusted'], 'headings.csv'));
  expect(rows[0].Qty).toBe(0);
  expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
  expect(({} as Record<string, unknown>).untrusted).toBeUndefined();
});

it('rejects declared archive expansion before constructing workbook cells', async()=>{
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Name:'Rice',Qty:1}]),'Stock');
 const bytes=new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'}));
 const view=new DataView(bytes.buffer);let central=-1;
 for(let offset=0;offset<bytes.length-46;offset++)if(view.getUint32(offset,true)===0x02014b50){central=offset;break;}
 expect(central).toBeGreaterThan(0);view.setUint32(central+24,65*1024*1024,true);
 await expect(parseImportFile(new File([bytes],'expansion.xlsx'))).rejects.toThrow('expands beyond');
});

it('validates compressed workbook contents and rejects falsified expansion lengths', async()=>{
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Name:'Rice',Qty:1}]),'Stock');
 const bytes=new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx',compression:true}));
 expect((await parseImportFile(new File([bytes],'compressed.xlsx')))[0]).toMatchObject({Name:'Rice',Qty:1});
 const view=new DataView(bytes.buffer);for(let offset=0;offset<bytes.length-46;offset++)if(view.getUint32(offset,true)===0x02014b50){view.setUint32(offset+24,1,true);break;}
 await expect(parseImportFile(new File([bytes],'falsified.xlsx'))).rejects.toThrow('expansion exceeds');
});
