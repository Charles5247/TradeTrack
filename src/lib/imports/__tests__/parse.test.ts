import { expect, it } from 'vitest';
import { parseImportFile } from '../parse';
import * as XLSX from 'xlsx';
it('parses quoted CSV and Excel workbooks with the existing parser',async()=>{
 const csv=new File(['Name,SKU,Price\n"Rice, bag",RICE,100\n'],'products.csv');
 expect((await parseImportFile(csv))[0]).toMatchObject({Name:'Rice, bag',SKU:'RICE',Price:'100'});
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Name:'Beans',Qty:5}]),'Products');
 const file=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'products.xlsx');
 expect((await parseImportFile(file))[0]).toEqual({Name:'Beans',Qty:'5'});
});
it('rejects unsupported file types',async()=>{
 await expect(parseImportFile(new File(['data'],'script.js'))).rejects.toThrow('CSV or XLSX');
});

it('preserves leading zero identifiers and does not silently ignore worksheets',async()=>{
 expect((await parseImportFile(new File(['Name,SKU\nDrug,000123\n'],'products.csv')))[0].SKU).toBe('000123');
 const book=XLSX.utils.book_new();for(const name of ['First','Second'])XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Name:'A'}]),name);
 await expect(parseImportFile(new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'multi.xlsx'))).rejects.toThrow('one worksheet');
});
